from django.urls import path
from .views import (
    ReferralListCreateView,
    ReferralDetailView,
    ReferralGenerateDraftView,
    ReferralActionView,
    EmergencyReferralView,
    ReferralByReferenceView,
)

urlpatterns = [
    path("", ReferralListCreateView.as_view(), name="referral-list-create"),
    path("emergency", EmergencyReferralView.as_view(), name="referral-emergency"),
    path("by-reference/<str:code>", ReferralByReferenceView.as_view(), name="referral-by-reference"),
    path("<uuid:public_id>", ReferralDetailView.as_view(), name="referral-detail"),
    path("<uuid:public_id>/generate-draft", ReferralGenerateDraftView.as_view(), name="referral-generate-draft"),
    path("<uuid:public_id>/actions/<str:action>", ReferralActionView.as_view(), name="referral-action"),
]

