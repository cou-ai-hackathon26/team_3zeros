from django.urls import path
from .views import (
    PractitionerSlotsView,
    AppointmentListCreateView,
    AppointmentDetailView,
    AppointmentActionView,
)

urlpatterns = [
    path("practitioners/<uuid:practitioner_id>/slots", PractitionerSlotsView.as_view(), name="practitioner-slots"),
    path("appointments", AppointmentListCreateView.as_view(), name="appointment-list-create"),
    path("appointments/<uuid:public_id>", AppointmentDetailView.as_view(), name="appointment-detail"),
    path("appointments/<uuid:public_id>/actions/<str:action>", AppointmentActionView.as_view(), name="appointment-action"),
]

