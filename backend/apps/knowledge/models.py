import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from pgvector.django import HnswIndex, VectorField

EMBEDDING_DIMENSIONS = 768


class KnowledgeDocument(models.Model):
    """A medical reference (book, guideline). Only `approved` documents in status READY are ever searched (D-24, D-29).

    Approval records who approved it and the named clinical reviewer (anti-drift rule 5): nothing becomes searchable
    by accident."""

    STATUS_CHOICES = [("PROCESSING", "Processing"), ("READY", "Ready"), ("FAILED", "Failed")]

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True, editable=False)
    title = models.CharField(max_length=255)
    publisher = models.CharField(max_length=255, blank=True)
    version = models.CharField(max_length=50, blank=True)
    language = models.CharField(max_length=5, default="en")
    rights_statement = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="PROCESSING", db_index=True)
    error = models.TextField(blank=True)
    storage_key = models.CharField(max_length=255, blank=True)
    sha256 = models.CharField(max_length=64, null=True, blank=True, unique=True)
    size = models.PositiveBigIntegerField(default=0)
    page_count = models.PositiveIntegerField(default=0)
    chunk_count = models.PositiveIntegerField(default=0)
    embedded_count = models.PositiveIntegerField(default=0)
    embedding_model = models.CharField(max_length=100, blank=True)

    approved = models.BooleanField(default=False, db_index=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewer_name = models.CharField(max_length=255, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    retired_at = models.DateTimeField(null=True, blank=True)

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({'approved' if self.approved else 'not approved'})"


class KnowledgeChunk(models.Model):
    document = models.ForeignKey(KnowledgeDocument, on_delete=models.CASCADE, related_name="chunks")
    page = models.PositiveIntegerField()
    ordinal = models.PositiveIntegerField(default=0)
    text = models.TextField()
    embedding = VectorField(dimensions=EMBEDDING_DIMENSIONS, null=True, blank=True)
    search_vector = SearchVectorField(null=True, blank=True)

    class Meta:
        ordering = ["document_id", "page", "ordinal", "id"]
        indexes = [
            HnswIndex(name="kb_chunk_embedding_hnsw", fields=["embedding"], m=16, ef_construction=64, opclasses=["vector_cosine_ops"]),
            GinIndex(name="kb_chunk_search_gin", fields=["search_vector"]),
        ]
