from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from apps.scheduling.views import (
    PractitionerSlotsView,
    AppointmentListCreateView,
    AppointmentDetailView,
    AppointmentActionView,
)
from apps.records.views import (
    PatientChartView,
    PatientEncounterListCreateView,
    EncounterDetailView,
    EncounterObservationCreateView,
    EncounterOrderListCreateView,
)
from apps.documents.views import PatientPriorResultsView
from apps.consent.views import (
    ConsentRequestDetailView,
    GrantConsentRequestView,
    RefuseConsentRequestView,
)
from apps.organizations.views import (
    DeviceEnrollView,
    DeviceRevokeView,
    AdminFacilitiesView,
    AdminPractitionersView,
    AdminSchedulesView,
    AdminCapacityReportsView,
    AdminStaffView,
    AdminStaffDetailView,
    AdminStaffActionView,
    AdminPermissionsView,
    FhirIntegrationBoundaryView,
    AccessRequestCreateView,
    AdminAccessRequestListView,
    AdminAccessRequestApproveView,
    AdminAccessRequestRejectView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # OpenAPI 3.1 schema
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Canonical MASTERPLAN §6.3 flat endpoints
    path("api/v1/patients/<uuid:patient_id>/chart", PatientChartView.as_view(), name="canonical-patient-chart"),
    path("api/v1/patients/<uuid:patient_id>/encounters", PatientEncounterListCreateView.as_view(), name="canonical-patient-encounters"),
    path("api/v1/patients/<uuid:patient_id>/results", PatientPriorResultsView.as_view(), name="canonical-patient-results"),
    path("api/v1/encounters/<uuid:public_id>", EncounterDetailView.as_view(), name="canonical-encounter-detail"),
    path("api/v1/encounters/<uuid:public_id>/observations", EncounterObservationCreateView.as_view(), name="canonical-encounter-observations"),
    path("api/v1/encounters/<uuid:public_id>/allergies", EncounterObservationCreateView.as_view(), name="canonical-encounter-allergies"),
    path("api/v1/encounters/<uuid:public_id>/medications", EncounterObservationCreateView.as_view(), name="canonical-encounter-medications"),
    path("api/v1/encounters/<uuid:public_id>/orders", EncounterOrderListCreateView.as_view(), name="canonical-encounter-orders"),
    path("api/v1/practitioners/<uuid:practitioner_id>/slots", PractitionerSlotsView.as_view(), name="canonical-practitioner-slots"),
    path("api/v1/appointments", AppointmentListCreateView.as_view(), name="canonical-appointment-list-create"),
    path("api/v1/appointments/<uuid:public_id>", AppointmentDetailView.as_view(), name="canonical-appointment-detail"),
    path("api/v1/appointments/<uuid:public_id>/actions/<str:action>", AppointmentActionView.as_view(), name="canonical-appointment-action"),
    path("api/v1/consent-requests/<uuid:public_id>", ConsentRequestDetailView.as_view(), name="canonical-consent-request-detail"),
    path("api/v1/consent-requests/<uuid:public_id>/grant", GrantConsentRequestView.as_view(), name="canonical-consent-request-grant"),
    path("api/v1/consent-requests/<uuid:public_id>/refuse", RefuseConsentRequestView.as_view(), name="canonical-consent-request-refuse"),
    path("api/v1/devices/enroll", DeviceEnrollView.as_view(), name="device-enroll"),
    path("api/v1/devices/<uuid:public_id>/revoke", DeviceRevokeView.as_view(), name="device-revoke"),
    path("api/v1/admin/facilities", AdminFacilitiesView.as_view(), name="admin-facilities"),
    path("api/v1/admin/practitioners", AdminPractitionersView.as_view(), name="admin-practitioners"),
    path("api/v1/admin/schedules", AdminSchedulesView.as_view(), name="admin-schedules"),
    path("api/v1/admin/capacity-reports", AdminCapacityReportsView.as_view(), name="admin-capacity-reports"),
    path("api/v1/admin/permissions", AdminPermissionsView.as_view(), name="admin-permissions"),
    path("api/v1/admin/staff", AdminStaffView.as_view(), name="admin-staff"),
    path("api/v1/admin/staff/<uuid:public_id>", AdminStaffDetailView.as_view(), name="admin-staff-detail"),
    path("api/v1/admin/staff/<uuid:public_id>/<str:action>", AdminStaffActionView.as_view(), name="admin-staff-action"),
    path("api/v1/access-requests", AccessRequestCreateView.as_view(), name="access-requests-create"),
    path("api/v1/admin/access-requests", AdminAccessRequestListView.as_view(), name="admin-access-requests-list"),
    path("api/v1/admin/access-requests/<uuid:public_id>/approve", AdminAccessRequestApproveView.as_view(), name="admin-access-requests-approve"),
    path("api/v1/admin/access-requests/<uuid:public_id>/reject", AdminAccessRequestRejectView.as_view(), name="admin-access-requests-reject"),
    path("api/v1/", include("apps.emergency_dept.urls")),
    path("api/v1/integrations/fhir/<path:resource_path>", FhirIntegrationBoundaryView.as_view(), name="fhir-boundary"),
    # App-prefixed API endpoints v1
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/patients/", include("apps.identity.urls")),
    path("api/v1/directory/", include("apps.directory.urls")),
    path("api/v1/scheduling/", include("apps.scheduling.urls")),
    path("api/v1/referrals/", include("apps.referrals.urls")),
    path("api/v1/consents/", include("apps.consent.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/records/", include("apps.records.urls")),
    path("api/v1/documents/", include("apps.documents.urls")),
    path("api/v1/triage/", include("apps.triage.urls")),
    path("api/v1/audit/", include("apps.audit.urls")),
]
