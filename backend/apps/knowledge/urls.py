from django.urls import path

from .views import (
    KnowledgeDocumentApproveView,
    KnowledgeDocumentDetailView,
    KnowledgeDocumentListView,
    KnowledgeDocumentRetireView,
    KnowledgeDocumentRetryView,
    KnowledgeSearchView,
)

urlpatterns = [
    path("documents", KnowledgeDocumentListView.as_view(), name="knowledge-documents"),
    path("documents/<uuid:public_id>", KnowledgeDocumentDetailView.as_view(), name="knowledge-document-detail"),
    path("documents/<uuid:public_id>/approve", KnowledgeDocumentApproveView.as_view(), name="knowledge-document-approve"),
    path("documents/<uuid:public_id>/retire", KnowledgeDocumentRetireView.as_view(), name="knowledge-document-retire"),
    path("documents/<uuid:public_id>/retry", KnowledgeDocumentRetryView.as_view(), name="knowledge-document-retry"),
    path("search", KnowledgeSearchView.as_view(), name="knowledge-search"),
]
