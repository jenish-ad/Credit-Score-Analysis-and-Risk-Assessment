from authentication.views import login, signup
from dashboard.views import dashboard
from payments.views import payment_history, payment_loans, payment_settle_loan, payment_take_loan

__all__ = [
    "signup",
    "login",
    "dashboard",
    "payment_loans",
    "payment_take_loan",
    "payment_settle_loan",
    "payment_history",
]
