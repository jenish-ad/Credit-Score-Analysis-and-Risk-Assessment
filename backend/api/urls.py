from django.urls import path

from authentication.views import login, signup
from dashboard.views import dashboard
from payments.views import payment_history, payment_loans, payment_settle_loan, payment_take_loan
from evaluation.views import evaluation, evaluation_approval

urlpatterns = [
    path("signup/", signup),
    path("login/", login),
    path("dashboard/", dashboard),
    path("payments/loans/", payment_loans),
    path("payments/take/", payment_take_loan),
    path("payments/settle/", payment_settle_loan),
    path("payments/history/", payment_history),
    path("evaluations/<str:applicant_id>", evaluation),
    path("evaluations/<str:applicant_id>/approval", evaluation_approval),
]
