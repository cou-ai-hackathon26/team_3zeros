from django.urls import path
from .views import (
    DocumentUploadView,
    DocumentDetailView,
    DocumentDownloadLinkView,
    DocumentContentView,
    DocumentExtractionView,
    DocumentVerifyView,
    DocumentRejectView,
    DocumentRetryOcrView,
)

urlpatterns = [
    path("", DocumentUploadView.as_view(), name="document-upload"),
    path("<uuid:public_id>", DocumentDetailView.as_view(), name="document-detail"),
    path("<uuid:public_id>/download-link", DocumentDownloadLinkView.as_view(), name="document-download-link"),
    path("<uuid:public_id>/content", DocumentContentView.as_view(), name="document-content"),
    path("<uuid:public_id>/extraction", DocumentExtractionView.as_view(), name="document-extraction"),
    path("<uuid:public_id>/extraction/verify", DocumentVerifyView.as_view(), name="document-extraction-verify"),
    path("<uuid:public_id>/extraction/reject", DocumentRejectView.as_view(), name="document-extraction-reject"),
    path("<uuid:public_id>/actions/retry_ocr", DocumentRetryOcrView.as_view(), name="document-retry-ocr"),
]

