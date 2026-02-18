from collections import defaultdict
from datetime import datetime, timedelta

import jwt
from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from creditscore_calculator.services import record_score_snapshot
from daulterprobability.services import as_percentage, calculate_default_probability


def _normalize_applicant_lookup(applicant_id):
    raw = str(applicant_id or "").strip()
    if not raw:
        return None, None

    if raw.upper().startswith("APP-"):
        suffix = raw[4:]
        if suffix.isdigit():
            return str(int(suffix)), raw

    if raw.isdigit():
        return str(int(raw)), raw

    return None, raw


def _risk_category(score, stored_risk_level):
    if stored_risk_level:
        level = str(stored_risk_level).upper()
        if level in {"LOW", "MEDIUM", "HIGH"}:
            return level
    if score >= 700:
        return "LOW"
    if score >= 650:
        return "MEDIUM"
    return "HIGH"


def _decision_for_risk(risk_category):
    return {
        "LOW": "APPROVE",
        "MEDIUM": "REVIEW",
        "HIGH": "REJECT",
    }.get(risk_category, "REVIEW")


def _resolve_user(applicant_id):
    normalized_user_id, normalized_username = _normalize_applicant_lookup(applicant_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT user_id, full_name, username, dob, phone, address, monthly_income, employment_type
            FROM users
            WHERE (%s IS NOT NULL AND CAST(user_id AS TEXT) = %s)
               OR LOWER(username) = LOWER(%s)
            LIMIT 1
            """,
            [normalized_user_id, normalized_user_id, normalized_username],
        )
        return cursor.fetchone()


def _extract_admin_claim(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return False

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return False

    return bool(payload.get("is_admin"))


def _pending_items_for_user(user_id):
    pending = []
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT account_id, account_type, purpose, current_balance, opened_date
            FROM credit_accounts
            WHERE user_id = %s AND status = 'pending_approval'
            ORDER BY account_id DESC
            """,
            [user_id],
        )
        for account_id, account_type, purpose, amount, opened_date in cursor.fetchall():
            pending.append(
                {
                    "id": str(account_id),
                    "type": "LOAN",
                    "requestId": str(account_id),
                    "title": account_type.replace("_", " ").title(),
                    "purpose": purpose,
                    "amount": float(amount or 0),
                    "createdAt": opened_date.isoformat() if hasattr(opened_date, "isoformat") else str(opened_date),
                    "status": "PENDING_APPROVAL",
                }
            )

        cursor.execute(
            """
            SELECT p.payment_id, p.account_id, p.amount_due, p.due_date, ca.account_type
            FROM payments p
            JOIN credit_accounts ca ON ca.account_id = p.account_id
            WHERE ca.user_id = %s AND p.status = 'pending_approval'
            ORDER BY p.payment_id DESC
            """,
            [user_id],
        )
        for payment_id, account_id, amount_due, due_date, account_type in cursor.fetchall():
            pending.append(
                {
                    "id": str(payment_id),
                    "type": "SETTLEMENT",
                    "requestId": str(payment_id),
                    "loanId": str(account_id),
                    "title": f"{account_type.replace('_', ' ').title()} settlement",
                    "amount": float(amount_due or 0),
                    "createdAt": due_date.isoformat() if hasattr(due_date, "isoformat") else str(due_date),
                    "status": "PENDING_APPROVAL",
                }
            )

    return pending


@api_view(["GET"])
@permission_classes([AllowAny])
def evaluation(request, applicant_id):
    user_row = _resolve_user(applicant_id)
    if not user_row:
        return Response({"detail": "Evaluation not found."}, status=status.HTTP_404_NOT_FOUND)

    user_id, full_name, username, dob, phone, address, monthly_income, employment_type = user_row

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT score, risk_level, factors, calculated_at
            FROM score_history
            WHERE user_id = %s
            ORDER BY calculated_at DESC
            LIMIT 1
            """,
            [user_id],
        )
        score_row = cursor.fetchone()

        if not score_row:
            # New signups may not have any score snapshots yet.
            # Create an initial snapshot so the evaluation page can load.
            record_score_snapshot(user_id)
            cursor.execute(
                """
                SELECT score, risk_level, factors, calculated_at
                FROM score_history
                WHERE user_id = %s
                ORDER BY calculated_at DESC
                LIMIT 1
                """,
                [user_id],
            )
            score_row = cursor.fetchone()

        if not score_row:
            return Response(
                {"detail": "No score history available for this applicant."},
                status=status.HTTP_404_NOT_FOUND,
            )

        score, risk_level, factors, calculated_at = score_row

        cursor.execute(
            """
            SELECT score, calculated_at
            FROM score_history
            WHERE user_id = %s
            ORDER BY calculated_at DESC
            LIMIT 6
            """,
            [user_id],
        )
        history_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(credit_limit), 0) AS total_limit,
                COALESCE(SUM(current_balance), 0) AS total_balance
            FROM credit_accounts
            WHERE user_id = %s AND status = 'active'
            """,
            [user_id],
        )
        total_limit, total_balance = cursor.fetchone()

    utilization_pct = float((total_balance / total_limit) * 100) if total_limit else 0.0

    latest_factors = factors if isinstance(factors, dict) else {}
    factor_values = defaultdict(
        int,
        {
            "payment_history": latest_factors.get("payment_history", 75),
            "credit_utilization": latest_factors.get("credit_utilization", max(0, int(100 - utilization_pct))),
            "credit_age": latest_factors.get("credit_age", 65),
            "inquiries": latest_factors.get("inquiries", 70),
            "debt_to_income": latest_factors.get("debt_to_income", max(35, int(100 - utilization_pct * 0.9))),
            "income_stability": latest_factors.get("income_stability", 70),
            "employment_history": latest_factors.get("employment_history", 72),
            "credit_mix": latest_factors.get("credit_mix", 68),
            "delinquencies": latest_factors.get("delinquencies", 80),
            "collateral_strength": latest_factors.get("collateral_strength", 60),
        },
    )

    factor_weights = [
        ("payment_history", "Payment History", 0.25),
        ("credit_utilization", "Credit Utilization", 0.18),
        ("credit_age", "Length of Credit History", 0.10),
        ("credit_mix", "Credit Mix", 0.08),
        ("inquiries", "Recent Credit Inquiries", 0.08),
        ("debt_to_income", "Debt-to-Income Ratio", 0.10),
        ("income_stability", "Income Stability", 0.08),
        ("employment_history", "Employment History", 0.05),
        ("delinquencies", "Delinquencies / Public Records", 0.05),
        ("collateral_strength", "Collateral / Asset Strength", 0.03),
    ]

    breakdown = []
    for key, label, weight in factor_weights:
        value = max(0, min(100, int(factor_values[key])))
        max_points = int(weight * 1000)
        points = round((value / 100) * max_points, 1)
        breakdown.append(
            {
                "key": key,
                "label": label,
                "weight": weight,
                "points": points,
                "maxPoints": max_points,
            }
        )

    positives = [
        f"{item['label']} is strong."
        for item in breakdown
        if item["maxPoints"] and (item["points"] / item["maxPoints"]) >= 0.75
    ]
    negatives = [
        f"{item['label']} needs improvement."
        for item in breakdown
        if item["maxPoints"] and (item["points"] / item["maxPoints"]) < 0.55
    ]

    risk_category = _risk_category(int(score), risk_level)
    default_probability = calculate_default_probability(
        int(score), risk_category=risk_category, utilization_pct=utilization_pct
    )
    decision = _decision_for_risk(risk_category)

    if risk_category == "LOW":
        limits = {"maxLoan": 500000, "maxTenureMonths": 48, "interestApr": 12.5}
    elif risk_category == "MEDIUM":
        limits = {"maxLoan": 250000, "maxTenureMonths": 30, "interestApr": 16.0}
    else:
        limits = {"maxLoan": 100000, "maxTenureMonths": 18, "interestApr": 22.0}

    history = [
        {
            "date": row[1].date().isoformat() if hasattr(row[1], "date") else str(row[1]),
            "score": int(row[0]),
            "event": "Evaluation snapshot",
        }
        for row in reversed(history_rows)
    ]

    canonical_applicant_id = f"APP-{int(user_id):05d}"

    return Response(
        {
            "applicant": {
                "id": canonical_applicant_id,
                "fullName": full_name or username,
                "dob": dob.isoformat() if hasattr(dob, "isoformat") else dob,
                "phone": phone,
                "address": address,
                "monthlyIncome": float(monthly_income) if monthly_income is not None else None,
                "employmentType": employment_type,
            },
            "evaluation": {
                "evaluationId": f"EVAL-{user_id}-{calculated_at.strftime('%Y%m%d%H%M%S')}",
                "createdAt": calculated_at.isoformat() if hasattr(calculated_at, "isoformat") else str(calculated_at),
                "creditScore": int(score),
                "riskBand": risk_category,
                "riskCategory": risk_category,
                "probabilityOfDefault": default_probability,
                "defaultProbabilityPercent": as_percentage(default_probability),
                "decision": decision,
                "loanApprovalRecommendation": decision,
                "notes": "Generated from latest score history and account utilization.",
                "limits": limits,
                "breakdown": breakdown,
                "creditScoreFactors": breakdown,
                "positiveFactors": positives,
                "negativeFactors": negatives,
                "history": history,
                "pendingApprovals": _pending_items_for_user(user_id),
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def evaluation_approval(request, applicant_id):
    if not _extract_admin_claim(request):
        return Response({"detail": "Admin authorization required."}, status=status.HTTP_403_FORBIDDEN)

    user_row = _resolve_user(applicant_id)
    if not user_row:
        return Response({"detail": "Evaluation not found."}, status=status.HTTP_404_NOT_FOUND)
    user_id = user_row[0]

    request_type = str(request.data.get("requestType") or "").strip().upper()
    request_id = str(request.data.get("requestId") or "").strip()
    action = str(request.data.get("action") or "").strip().upper()

    if request_type not in {"LOAN", "SETTLEMENT"}:
        return Response({"error": "requestType must be LOAN or SETTLEMENT."}, status=status.HTTP_400_BAD_REQUEST)
    if action not in {"APPROVE", "REJECT"}:
        return Response({"error": "action must be APPROVE or REJECT."}, status=status.HTTP_400_BAD_REQUEST)
    if not request_id:
        return Response({"error": "requestId is required."}, status=status.HTTP_400_BAD_REQUEST)

    eps = 1e-6

    with connection.cursor() as cursor:
        if request_type == "LOAN":
            cursor.execute(
                """
                SELECT account_id, current_balance, account_type
                FROM credit_accounts
                WHERE account_id = %s AND user_id = %s AND status = 'pending_approval'
                """,
                [request_id, user_id],
            )
            account_row = cursor.fetchone()
            if not account_row:
                return Response({"error": "Pending loan request not found."}, status=status.HTTP_404_NOT_FOUND)

            account_id, current_balance, _ = account_row
            if action == "REJECT":
                cursor.execute(
                    """
                    UPDATE credit_accounts
                    SET status = 'rejected'
                    WHERE account_id = %s
                    """,
                    [account_id],
                )
                return Response({"message": "Loan request rejected."}, status=status.HTTP_200_OK)

            due_date = datetime.utcnow().date() + timedelta(days=30)
            cursor.execute(
                """
                UPDATE credit_accounts
                SET status = 'active'
                WHERE account_id = %s
                """,
                [account_id],
            )
            cursor.execute(
                """
                INSERT INTO payments (account_id, due_date, amount_due, amount_paid, status)
                VALUES (%s, %s, %s, 0, 'due')
                """,
                [account_id, due_date, float(current_balance or 0)],
            )

            record_score_snapshot(user_id, inquiry_penalty=8)
            return Response({"message": "Loan request approved."}, status=status.HTTP_200_OK)

        cursor.execute(
            """
            SELECT p.payment_id, p.account_id, p.amount_due, ca.current_balance
            FROM payments p
            JOIN credit_accounts ca ON ca.account_id = p.account_id
            WHERE p.payment_id = %s
              AND p.status = 'pending_approval'
              AND ca.user_id = %s
              AND ca.status = 'active'
            """,
            [request_id, user_id],
        )
        settlement_row = cursor.fetchone()
        if not settlement_row:
            return Response({"error": "Pending settlement request not found."}, status=status.HTTP_404_NOT_FOUND)

        payment_id, account_id, settle_amount, current_balance = settlement_row
        settle_amount = float(settle_amount or 0)
        current_balance = float(current_balance or 0)

        if action == "REJECT":
            cursor.execute("UPDATE payments SET status = 'rejected' WHERE payment_id = %s", [payment_id])
            return Response({"message": "Settlement request rejected."}, status=status.HTTP_200_OK)

        if settle_amount - current_balance > eps:
            return Response(
                {
                    "error": "Settlement exceeds current balance.",
                    "outstanding": round(current_balance, 2),
                    "requested": round(settle_amount, 2),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        cursor.execute(
            """
            SELECT payment_id, due_date, amount_due, amount_paid
            FROM payments
            WHERE account_id = %s AND status = 'due'
            ORDER BY due_date ASC, payment_id ASC
            LIMIT 1
            """,
            [account_id],
        )
        due_payment = cursor.fetchone()

        settled_on_time = True
        if due_payment:
            due_payment_id, due_date, amount_due, amount_paid = due_payment
            amount_due = float(amount_due or 0)
            amount_paid = float(amount_paid or 0)

            updated_paid = min(amount_due, amount_paid + settle_amount)
            remaining_due = max(0.0, amount_due - updated_paid)

            if datetime.utcnow().date() > due_date:
                payment_status = "late" if remaining_due <= eps else "due"
            else:
                payment_status = "paid" if remaining_due <= eps else "due"

            cursor.execute(
                """
                UPDATE payments
                SET paid_date = CURRENT_DATE,
                    amount_paid = %s,
                    status = %s
                WHERE payment_id = %s
                """,
                [updated_paid, payment_status, due_payment_id],
            )
            settled_on_time = payment_status != "late"

        new_balance = current_balance - settle_amount
        if new_balance < eps:
            new_balance = 0.0
        new_status = "closed" if new_balance == 0.0 else "active"

        cursor.execute(
            """
            UPDATE credit_accounts
            SET current_balance = %s,
                status = %s
            WHERE account_id = %s
            """,
            [new_balance, new_status, account_id],
        )

        cursor.execute(
            """
            UPDATE payments
            SET paid_date = CURRENT_DATE,
                amount_paid = amount_due,
                status = 'approved'
            WHERE payment_id = %s
            """,
            [payment_id],
        )

    recovery_points = 8 if new_balance == 0.0 and settled_on_time else 0
    record_score_snapshot(user_id, inquiry_penalty=-recovery_points)
    return Response({"message": "Settlement request approved."}, status=status.HTTP_200_OK)
