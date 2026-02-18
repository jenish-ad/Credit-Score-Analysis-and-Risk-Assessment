import json

from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from authentication.services import get_authenticated_user


def _parse_money(value) -> float:
    """
    Accepts: 1000, "1000", "1,000", "Rs. 1,000"
    Returns float (0.0 if invalid)
    """
    try:
        cleaned = str(value).replace("Rs.", "").replace("rs.", "").replace(",", "").strip()
        return float(cleaned)
    except (TypeError, ValueError):
        return 0.0


def _sync_credit_account_sequence(cursor):
    """Keep account_id sequence aligned with table data to avoid duplicate PK inserts."""
    cursor.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('credit_accounts', 'account_id'),
            COALESCE((SELECT MAX(account_id) FROM credit_accounts), 1),
            true
        )
        """
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def payment_loans(request):
    username, user_data = get_authenticated_user(request)
    if not username or not user_data:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = user_data["user_id"]

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                ca.account_id,
                ca.account_type,
                ca.current_balance,
                ca.status,
                COALESCE(SUM(GREATEST(p.amount_due - p.amount_paid, 0)), 0) AS outstanding
            FROM credit_accounts ca
            LEFT JOIN payments p ON p.account_id = ca.account_id
            WHERE ca.user_id = %s AND ca.status = 'active'
            GROUP BY ca.account_id, ca.account_type, ca.current_balance, ca.status
            ORDER BY ca.account_id DESC
            """,
            [user_id],
        )
        rows = cursor.fetchall()

    loans = []
    for account_id, account_type, current_balance, account_status, outstanding in rows:
        loans.append(
            {
                "id": str(account_id),
                "title": account_type.replace("_", " ").title(),
                "outstanding": float(max(outstanding, current_balance or 0)),
                "status": account_status.upper(),
            }
        )

    return Response({"loans": loans}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def payment_take_loan(request):
    username, user_data = get_authenticated_user(request)
    if not username or not user_data:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = user_data["user_id"]
    category = (request.data.get("category") or "").strip().lower()
    purpose = (request.data.get("purpose") or "").strip()

    amount = _parse_money(request.data.get("amount", 0))

    employment_type = (request.data.get("employmentType") or request.data.get("employment_type") or "").strip()

    income = _parse_money(request.data.get("income", request.data.get("monthly_income", 0)))

    if category not in {"general", "emi", "cc"}:
        return Response({"error": "Invalid loan category."}, status=status.HTTP_400_BAD_REQUEST)

    if amount <= 0:
        return Response({"error": "Amount must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    if not purpose:
        return Response({"error": "Purpose is required."}, status=status.HTTP_400_BAD_REQUEST)

    if not employment_type:
        return Response({"error": "Employment type is required."}, status=status.HTTP_400_BAD_REQUEST)

    if income <= 0:
        return Response({"error": "Income must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    account_type_map = {
        "general": "loan_general",
        "emi": "loan_emi",
        "cc": "credit_card_usage",
    }

    tenure_months = None
    if category in {"general", "emi"}:
        try:
            tenure_months = int(request.data.get("tenureMonths", 0))
        except (TypeError, ValueError):
            tenure_months = 0

        if tenure_months < 3 or tenure_months > 60:
            return Response({"error": "Tenure must be 3-60 months."}, status=status.HTTP_400_BAD_REQUEST)

    with connection.cursor() as cursor:
        _sync_credit_account_sequence(cursor)

        cursor.execute(
            """
            UPDATE users
            SET employment_type = %s, monthly_income = %s
            WHERE user_id = %s
            """,
            [employment_type, income, user_id],
        )

        cursor.execute(
            """
            INSERT INTO credit_accounts (
                user_id,
                account_type,
                purpose,
                tenure_months,
                credit_limit,
                current_balance,
                opened_date,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, CURRENT_DATE, 'pending_approval')
            RETURNING account_id
            """,
            [user_id, account_type_map[category], purpose, tenure_months, amount, amount],
        )
        new_account_id = cursor.fetchone()[0]

    return Response(
        {
            "message": "Loan request created successfully and is pending admin approval.",
            "loan": {
                "id": str(new_account_id),
                "title": account_type_map[category].replace("_", " ").title(),
                "outstanding": amount,
                "status": "PENDING_APPROVAL",
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def payment_settle_loan(request):
    username, user_data = get_authenticated_user(request)
    if not username or not user_data:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = user_data["user_id"]

    payload = {}
    try:
        if isinstance(request.data, dict) and request.data:
            payload = request.data
        else:
            raw = request.body.decode("utf-8") if request.body else ""
            payload = json.loads(raw) if raw.strip().startswith("{") else {}
    except Exception:
        payload = {}

    loan_id = (
        payload.get("loanId")
        or payload.get("loan_id")
        or payload.get("id")
        or payload.get("account_id")
        or request.query_params.get("loanId")
        or request.query_params.get("loan_id")
    )

    raw_amount = (
        payload.get("amount")
        or payload.get("payAmount")
        or payload.get("paymentAmount")
        or payload.get("amount_paid")
        or request.query_params.get("amount")
    )

    if loan_id is None or str(loan_id).strip() == "":
        return Response(
            {"error": "loanId is required.", "received": payload},
            status=status.HTTP_400_BAD_REQUEST,
        )
    loan_id = str(loan_id).strip()

    try:
        cleaned = str(raw_amount).replace("Rs.", "").replace("rs.", "").replace(",", "").strip()
        amount = float(cleaned)
    except Exception:
        amount = 0.0

    if amount <= 0:
        return Response(
            {"error": "Amount must be greater than 0.", "received_amount": raw_amount, "received": payload},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eps = 1e-6

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT account_id, current_balance
            FROM credit_accounts
            WHERE account_id = %s AND user_id = %s AND status = 'active'
            """,
            [loan_id, user_id],
        )
        account_row = cursor.fetchone()

        if not account_row:
            return Response(
                {"error": "Loan not found.", "loanId": loan_id, "received": payload},
                status=status.HTTP_404_NOT_FOUND,
            )

        account_id, current_balance = account_row
        current_balance = float(current_balance or 0.0)

        if amount - current_balance > eps:
            return Response(
                {
                    "error": "Payment cannot exceed outstanding balance.",
                    "outstanding": round(current_balance, 2),
                    "attempted": round(amount, 2),
                    "received": payload,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        cursor.execute(
            """
            INSERT INTO payments (account_id, due_date, amount_due, amount_paid, status)
            VALUES (%s, CURRENT_DATE, %s, 0, 'pending_approval')
            """,
            [account_id, amount],
        )

    return Response(
        {
            "message": "Settlement request submitted and is pending admin approval.",
            "remaining_balance": round(current_balance, 2),
            "closed": False,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def payment_history(request):
    username, user_data = get_authenticated_user(request)
    if not username or not user_data:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = user_data["user_id"]

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                p.payment_id,
                p.due_date,
                p.paid_date,
                p.amount_due,
                p.amount_paid,
                p.status,
                ca.account_type
            FROM payments p
            JOIN credit_accounts ca ON ca.account_id = p.account_id
            WHERE ca.user_id = %s
            ORDER BY COALESCE(p.paid_date, p.due_date) DESC, p.payment_id DESC
            LIMIT 30
            """,
            [user_id],
        )
        rows = cursor.fetchall()

    history = [
        {
            "id": str(payment_id),
            "date": (paid_date or due_date).isoformat(),
            "type": account_type.replace("_", " ").title(),
            "amount": float(amount_paid or amount_due or 0),
            "status": pay_status.upper(),
        }
        for payment_id, due_date, paid_date, amount_due, amount_paid, pay_status, account_type in rows
    ]

    return Response({"history": history}, status=status.HTTP_200_OK)
