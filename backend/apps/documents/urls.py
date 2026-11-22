from django.urls import path
from .views import (
    DocumentUploadView,
    DocumentDetailView,
    DocumentExtractionView,
    DocumentVerifyView,
    DocumentRejectView,
)

urlpatterns = [
    path("", DocumentUploadView.as_view(), name="document-upload"),
    path("<uuid:public_id>", DocumentDetailView.as_view(), name="document-detail"),
    path("<uuid:public_id>/extraction", DocumentExtractionView.as_view(), name="document-extraction"),
    path("<uuid:public_id>/extraction/verify", DocumentVerifyView.as_view(), name="document-extraction-verify"),
    path("<uuid:public_id>/extraction/reject", DocumentRejectView.as_view(), name="document-extraction-reject"),
]
