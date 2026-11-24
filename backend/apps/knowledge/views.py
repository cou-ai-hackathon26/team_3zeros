"""Knowledge-base administration (MASTERPLAN D-29). Platform admin only; facility admins get 403.
Every change writes an audit event. A book is never searchable until approved with a named clinical reviewer."""
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import permissions, serializers, status, views
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.audit.services import record_audit_event
from apps.common.exceptions import NotAuthenticatedError, NotFoundError, PermissionDeniedError, ValidationError
from .ingest import queue_ingestion, store_upload
from .models import KnowledgeDocument
from .search import search


def _require_platform_admin(user):
    if not user or not user.is_authenticated:
        raise NotAuthenticatedError("Sign in required.")
    if not hasattr(user, "platform_admin"):
        raise PermissionDeniedError("Only a platform admin can manage the knowledge base.")


def _audit(request, doc, reason, action="update"):
    record_audit_event(
        action=action, object_type="knowledge_document", object_id=str(doc.public_id), actor_user=request.user,
        actor_role="platform_admin", reason=reason, request_id=getattr(request, "request_id", ""),
    )


def _get(public_id) -> KnowledgeDocument:
    doc = KnowledgeDocument.objects.filter(public_id=public_id).select_related("approved_by", "uploaded_by").first()
    if not doc:
        raise NotFoundError("Document not found.")
    return doc


class KnowledgeDocumentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = KnowledgeDocument
        fields = [
            "id", "title", "publisher", "version", "language", "rights_statement", "status", "error", "size", "page_count",
            "chunk_count", "embedded_count", "embedding_model", "approved", "approved_by_name", "reviewer_name", "approved_at",
            "retired_at", "created_at",
        ]

    def get_approved_by_name(self, obj):
        return (obj.approved_by.display_name or obj.approved_by.email) if obj.approved_by else None


class DocumentCreateSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=255)
    publisher = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    version = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    language = serializers.ChoiceField(choices=["en", "bn"], default="en")
    rights_statement = serializers.CharField(required=False, allow_blank=True, default="")


class ApproveSerializer(serializers.Serializer):
    reviewer_name = serializers.CharField(max_length=255)
    rights_confirmed = serializers.BooleanField()


class KnowledgeDocumentListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        _require_platform_admin(request.user)
        docs = KnowledgeDocument.objects.select_related("approved_by").all()
        return Response({"results": KnowledgeDocumentSerializer(docs, many=True).data, "next_cursor": None})

    def post(self, request):
        _require_platform_admin(request.user)
        data = DocumentCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        doc = store_upload(v["file"], title=v["title"], publisher=v["publisher"], version=v["version"], language=v["language"],
                           rights_statement=v["rights_statement"], user=request.user)
        _audit(request, doc, "uploaded", action="create")
        return Response(KnowledgeDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class KnowledgeDocumentDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        _require_platform_admin(request.user)
        return Response(KnowledgeDocumentSerializer(_get(public_id)).data)

    def delete(self, request, public_id):
        _require_platform_admin(request.user)
        doc = _get(public_id)
        if doc.approved:
            raise ValidationError("An approved document cannot be deleted. Retire it first.")
        _audit(request, doc, "deleted")
        if doc.storage_key and default_storage.exists(doc.storage_key):
            default_storage.delete(doc.storage_key)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class KnowledgeDocumentApproveView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        _require_platform_admin(request.user)
        data = ApproveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        doc = _get(public_id)
        if doc.status != "READY":
            raise ValidationError("Only a document that finished processing can be approved.")
        if not data.validated_data["rights_confirmed"]:
            raise ValidationError("Confirm that you have the right to use this book.")
        doc.approved, doc.approved_by = True, request.user
        doc.reviewer_name, doc.approved_at, doc.retired_at = data.validated_data["reviewer_name"].strip(), timezone.now(), None
        doc.save(update_fields=["approved", "approved_by", "reviewer_name", "approved_at", "retired_at"])
        _audit(request, doc, f"approved; clinical reviewer: {doc.reviewer_name}")
        return Response(KnowledgeDocumentSerializer(doc).data)


class KnowledgeDocumentRetireView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        _require_platform_admin(request.user)
        doc = _get(public_id)
        doc.approved, doc.retired_at = False, timezone.now()
        doc.save(update_fields=["approved", "retired_at"])
        _audit(request, doc, "retired")
        return Response(KnowledgeDocumentSerializer(doc).data)


class KnowledgeDocumentRetryView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        _require_platform_admin(request.user)
        doc = _get(public_id)
        if doc.status != "FAILED":
            raise ValidationError("Only a failed document can be retried.")
        doc.status, doc.error = "PROCESSING", ""
        doc.save(update_fields=["status", "error"])
        queue_ingestion(doc)
        _audit(request, doc, "retry requested")
        return Response(KnowledgeDocumentSerializer(doc).data, status=status.HTTP_202_ACCEPTED)


class KnowledgeSearchView(views.APIView):
    """Try a question against a book (approved or not) before approving it."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_platform_admin(request.user)
        q = request.query_params.get("q", "").strip()
        if not q:
            raise ValidationError("q is required.")
        hits = search(q, limit=5, approved_only=False, document=request.query_params.get("document"))
        return Response({"results": [{k: v for k, v in h.items() if k != "id"} for h in hits]})
