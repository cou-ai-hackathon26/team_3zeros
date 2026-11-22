from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    # OpenAPI 3.1 schema
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # API endpoints v1
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

