import json
from datetime import date

from django.db import connection


SCORE_MIN = 300
SCORE_MAX = 850


def _clamp(value, lower=0, upper=100):
    return max(lower, min(upper, int(round(value))))


def _risk_level_for_score(score):
    if score >= 720:
        return "low"
    if score >= 660:
        return "medium"
    return "high"


def record_score_snapshot(user_id, inquiry_penalty=0):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COALESCE(monthly_income, 0)
            FROM users
            WHERE user_id = %s
            """,
            [user_id],
        )
        user_income_row = cursor.fetchone()
        monthly_income = float(user_income_row[0] or 0) if user_income_row else 0.0

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(credit_limit), 0) AS total_limit,
                COALESCE(SUM(current_balance), 0) AS total_balance,
                COALESCE(AVG(current_balance), 0) AS avg_balance,
                COUNT(*) AS total_accounts,
                COUNT(*) FILTER (WHERE status = 'active') AS active_accounts
            FROM credit_accounts
            WHERE user_id = %s
            """,
            [user_id],
        )
        total_limit, total_balance, avg_balance, total_accounts, active_accounts = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                p.due_date,
                p.paid_date,
                p.status,
                p.amount_due,
                p.amount_paid,
                ca.opened_date,
                ca.account_type
            FROM payments p
            JOIN credit_accounts ca ON ca.account_id = p.account_id
            WHERE ca.user_id = %s
            """,
            [user_id],
        )
        payment_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT score, factors
            FROM score_history
            WHERE user_id = %s
            ORDER BY calculated_at DESC
            LIMIT 1
            """,
            [user_id],
        )
        latest_snapshot = cursor.fetchone()

    total_limit = float(total_limit or 0)
    total_balance = float(total_balance or 0)
    avg_balance = float(avg_balance or 0)
    total_accounts = int(total_accounts or 0)
    active_accounts = int(active_accounts or 0)

    utilization_pct = (total_balance / total_limit) * 100 if total_limit > 0 else 0.0

    completed_payments = 0
    on_time_payments = 0
    severe_late_payments = 0
    total_due_amount = 0.0
    total_paid_amount = 0.0
    account_types = set()
    credit_age_days = []

    today = date.today()
    for due_date, paid_date, payment_status, amount_due, amount_paid, opened_date, account_type in payment_rows:
        if account_type:
            account_types.add(account_type)
        if opened_date:
            credit_age_days.append(max(0, (today - opened_date).days))

        if payment_status in {"paid", "late", "approved"}:
            completed_payments += 1
            total_due_amount += float(amount_due or 0)
            total_paid_amount += float(amount_paid or 0)

            if paid_date and due_date and paid_date <= due_date:
                on_time_payments += 1
            if due_date and paid_date and (paid_date - due_date).days > 30:
                severe_late_payments += 1

    if completed_payments:
        timeliness_ratio = on_time_payments / completed_payments
        payment_history = _clamp(35 + timeliness_ratio * 65)
    else:
        payment_history = 70

    # Strong penalty when utilization crosses common lending thresholds.
    if utilization_pct <= 10:
        credit_utilization = 100
    elif utilization_pct <= 30:
        credit_utilization = _clamp(95 - (utilization_pct - 10) * 0.75)
    elif utilization_pct <= 50:
        credit_utilization = _clamp(80 - (utilization_pct - 30) * 1.2)
    elif utilization_pct <= 75:
        credit_utilization = _clamp(56 - (utilization_pct - 50) * 1.2)
    else:
        credit_utilization = _clamp(26 - (utilization_pct - 75) * 0.8)

    avg_credit_age_days = sum(credit_age_days) / len(credit_age_days) if credit_age_days else 365
    credit_age_years = avg_credit_age_days / 365
    credit_age = _clamp(45 + min(55, credit_age_years * 11))

    # Inquiries degrade with new approvals; gradual recovery handled through history.
    previous_factors = latest_snapshot[1] if latest_snapshot and isinstance(latest_snapshot[1], dict) else {}
    previous_inquiries = int(previous_factors.get("inquiries", 80))
    inquiries = _clamp(previous_inquiries - inquiry_penalty, 35, 100)

    debt_to_income_raw = (total_balance / monthly_income) * 100 if monthly_income > 0 else 80
    debt_to_income = _clamp(100 - min(90, debt_to_income_raw * 1.1), 10, 100)

    repayment_coverage = (total_paid_amount / total_due_amount) if total_due_amount > 0 else 1.0
    delinquencies = _clamp(100 - (severe_late_payments * 18) - max(0, (1 - repayment_coverage) * 35), 20, 100)

    # Prefer diverse but manageable account mix.
    credit_mix = _clamp(55 + min(35, len(account_types) * 15) - max(0, total_accounts - 5) * 4, 25, 100)

    # Keep optional factors expected by frontend/evaluation.
    factors = {
        "payment_history": payment_history,
        "credit_utilization": credit_utilization,
        "credit_age": credit_age,
        "inquiries": inquiries,
        "debt_to_income": debt_to_income,
        "delinquencies": delinquencies,
        "credit_mix": credit_mix,
        "income_stability": _clamp(previous_factors.get("income_stability", 72), 35, 100),
        "employment_history": _clamp(previous_factors.get("employment_history", 70), 35, 100),
        "collateral_strength": _clamp(previous_factors.get("collateral_strength", 60), 25, 100),
        "active_accounts": active_accounts,
        "total_accounts": total_accounts,
        "utilization_pct": round(utilization_pct, 2),
    }

    weighted_factor_score = (
        payment_history * 0.32
        + credit_utilization * 0.22
        + credit_age * 0.11
        + inquiries * 0.08
        + debt_to_income * 0.11
        + delinquencies * 0.08
        + credit_mix * 0.08
    )

    # Map factor score [0-100] -> FICO-like [300-850].
    score = int(round(SCORE_MIN + (weighted_factor_score / 100) * (SCORE_MAX - SCORE_MIN)))
    score = max(SCORE_MIN, min(SCORE_MAX, score))
    risk_level = _risk_level_for_score(score)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO score_history (user_id, score, risk_level, factors)
            VALUES (%s, %s, %s, %s::jsonb)
            """,
            [user_id, score, risk_level, json.dumps(factors)],
        )