from django.urls import path
from .views import (
    PatientListCreateView,
    PatientDetailView,
    PatientDuplicateCandidatesView,
    ResolveDuplicateCandidateView,
)

urlpatterns = [
    path("", PatientListCreateView.as_view(), name="patient-list-create"),
    path("<uuid:public_id>", PatientDetailView.as_view(), name="patient-detail"),
    path("<uuid:public_id>/duplicate-candidates", PatientDuplicateCandidatesView.as_view(), name="patient-duplicate-candidates"),
    path("<uuid:public_id>/duplicate-candidates/<uuid:candidate_id>/resolve", ResolveDuplicateCandidateView.as_view(), name="resolve-duplicate-candidate"),
]

