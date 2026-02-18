from collections import defaultdict
from datetime import datetime

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from authentication.services import get_authenticated_user
from django.db import connection


@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard(request):
    username, user_data = get_authenticated_user(request)
    if not username or not user_data:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = user_data["user_id"]
    full_name = user_data["full_name"]

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT score, risk_level, factors, calculated_at
            FROM score_history
            WHERE user_id = %s
            ORDER BY calculated_at DESC
            LIMIT 6
            """,
            [user_id],
        )
        score_rows = cursor.fetchall()

    latest_score = score_rows[0][0] if score_rows else 0
    latest_risk = (score_rows[0][1] if score_rows else "unknown").title()
    latest_factors = score_rows[0][2] if score_rows else {}

    score_trend = [{"label": row[3].strftime("%b"), "score": int(row[0])} for row in reversed(score_rows)]

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

    utilization = float((total_balance / total_limit) * 100) if total_limit else 0.0

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                p.due_date,
                ca.account_type,
                p.amount_due,
                p.status,
                p.paid_date
            FROM payments p
            JOIN credit_accounts ca ON ca.account_id = p.account_id
            WHERE ca.user_id = %s
            ORDER BY p.due_date DESC
            LIMIT 8
            """,
            [user_id],
        )
        payment_rows = cursor.fetchall()

    completed_in_last_year = 0
    on_time_in_last_year = 0
    now = datetime.utcnow().date()

    recent_activity = []
    for due_date, account_type, amount_due, pay_status, paid_date in payment_rows:
        status_label = "On time" if pay_status == "paid" and paid_date and paid_date <= due_date else pay_status.title()
        tone = "good" if status_label == "On time" else "neutral"
        recent_activity.append(
            {
                "date": due_date.isoformat(),
                "type": account_type.replace("_", " ").title(),
                "amount": f"Rs. {float(amount_due):,.0f}",
                "status": status_label,
                "tone": tone,
            }
        )

        if (now - due_date).days <= 365 and pay_status in {"paid", "late"}:
            completed_in_last_year += 1
            if paid_date and paid_date <= due_date:
                on_time_in_last_year += 1

    on_time_rate = (on_time_in_last_year / completed_in_last_year * 100) if completed_in_last_year else 0

    default_factor_map = {
        "payment_history": 85,
        "credit_utilization": max(0, int(100 - utilization)),
        "credit_age": 68,
        "inquiries": 82,
    }
    factor_values = defaultdict(int, default_factor_map)
    if isinstance(latest_factors, dict):
        for key, value in latest_factors.items():
            if isinstance(value, (int, float)):
                factor_values[key] = max(0, min(100, int(value)))

    factor_payload = [
        {"label": "Payment History", "value": factor_values["payment_history"]},
        {"label": "Credit Utilization", "value": factor_values["credit_utilization"]},
        {"label": "Credit Age", "value": factor_values["credit_age"]},
        {"label": "Inquiries", "value": factor_values["inquiries"]},
    ]

    alerts = []
    if utilization >= 30:
        alerts.append({"title": "Utilization is close to 30%", "desc": "Try paying down your card balance this week.", "tone": "warn"})
    if on_time_rate >= 95:
        alerts.append({"title": "No missed payments", "desc": "Great — keep the streak going.", "tone": "good"})
    if not alerts:
        alerts.append({"title": "Add payment records", "desc": "More payment history helps generate better risk insights.", "tone": "warn"})

    return Response(
        {
            "user": {"username": username, "full_name": full_name},
            "stats": {
                "credit_score": int(latest_score),
                "score_band": "Good" if latest_score >= 700 else "Fair" if latest_score >= 650 else "Needs work",
                "risk_level": latest_risk,
                "utilization": round(utilization, 1),
                "on_time_payments": round(on_time_rate, 1),
            },
            "score_trend": score_trend,
            "key_factors": factor_payload,
            "recent_activity": recent_activity,
            "alerts": alerts,
        },
        status=status.HTTP_200_OK,
    )
