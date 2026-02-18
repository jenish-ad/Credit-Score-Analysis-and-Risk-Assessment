import json

from django.db import connection


def record_score_snapshot(user_id, inquiry_penalty=0):
    with connection.cursor() as cursor:
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

        cursor.execute(
            """
            SELECT
                p.due_date,
                p.paid_date,
                p.status
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

    utilization_pct = float((total_balance / total_limit) * 100) if total_limit else 0.0

    completed_payments = 0
    on_time_payments = 0
    for due_date, paid_date, payment_status in payment_rows:
        if payment_status in {"paid", "late"}:
            completed_payments += 1
            if paid_date and paid_date <= due_date:
                on_time_payments += 1

    payment_history = int((on_time_payments / completed_payments) * 100) if completed_payments else 75
    credit_utilization = max(0, min(100, int(100 - utilization_pct)))

    previous_factors = latest_snapshot[1] if latest_snapshot and isinstance(latest_snapshot[1], dict) else {}
    previous_inquiries = int(previous_factors.get("inquiries", 82))
    previous_credit_age = int(previous_factors.get("credit_age", 68))

    inquiries = max(40, min(100, previous_inquiries - int(inquiry_penalty)))
    credit_age = max(50, min(100, previous_credit_age))

    weighted_score = (
        300
        + payment_history * 2.2
        + credit_utilization * 1.8
        + credit_age * 1.2
        + inquiries * 0.8
    )
    score = int(max(300, min(850, round(weighted_score))))

    risk_level = "low"
    if score < 650:
        risk_level = "high"
    elif score < 700:
        risk_level = "medium"

    factors = {
        "payment_history": payment_history,
        "credit_utilization": credit_utilization,
        "credit_age": credit_age,
        "inquiries": inquiries,
    }

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO score_history (user_id, score, risk_level, factors)
            VALUES (%s, %s, %s, %s::jsonb)
            """,
            [user_id, score, risk_level, json.dumps(factors)],
        )
