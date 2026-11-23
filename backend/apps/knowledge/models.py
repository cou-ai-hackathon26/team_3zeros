from django.db import models


class KnowledgeDocument(models.Model):
    """A medical reference (book, guideline). Only `approved` documents are ever searched (MASTERPLAN D-24)."""

    title = models.CharField(max_length=255)
    publisher = models.CharField(max_length=255, blank=True)
    version = models.CharField(max_length=50, blank=True)
    approved = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({'approved' if self.approved else 'not approved'})"


class KnowledgeChunk(models.Model):
    document = models.ForeignKey(KnowledgeDocument, on_delete=models.CASCADE, related_name="chunks")
    page = models.PositiveIntegerField()
    text = models.TextField()

    class Meta:
        ordering = ["document_id", "page", "id"]
