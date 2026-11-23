from django.urls import path
from .views import (
    PatientChartView,
    PatientEncounterListCreateView,
    EncounterDetailView,
    EncounterObservationCreateView,
)

urlpatterns = [
    path("patients/<uuid:patient_id>/chart", PatientChartView.as_view(), name="patient-chart"),
    path("patients/<uuid:patient_id>/encounters", PatientEncounterListCreateView.as_view(), name="patient-encounters"),
    path("encounters/<uuid:public_id>", EncounterDetailView.as_view(), name="encounter-detail"),
    path("encounters/<uuid:public_id>/observations", EncounterObservationCreateView.as_view(), name="encounter-observations"),
    path("encounters/<uuid:public_id>/allergies", EncounterObservationCreateView.as_view(), name="encounter-allergies"),
    path("encounters/<uuid:public_id>/medications", EncounterObservationCreateView.as_view(), name="encounter-medications"),
]

