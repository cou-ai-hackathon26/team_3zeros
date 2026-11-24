import pgvector.django.vector
from django.db import migrations
from pgvector.django import HnswIndex


def reset_old_vectors(apps, schema_editor):
    """768-number vectors cannot become 1,024-number ones, and a different model's vectors are not comparable anyway.
    Clear them and mark the books so the admin sees they must be embedded again (Retry resumes from zero)."""
    Chunk = apps.get_model("knowledge", "KnowledgeChunk")
    Document = apps.get_model("knowledge", "KnowledgeDocument")
    Chunk.objects.update(embedding=None)
    Document.objects.filter(chunk_count__gt=0).update(
        status="FAILED", embedded_count=0, embedding_model="",
        error="The embedding model changed (1,024-number vectors). Retry to embed this book again.",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("knowledge", "0002_pgvector_hybrid_search"),
    ]

    operations = [
        migrations.RunPython(reset_old_vectors, migrations.RunPython.noop),
        migrations.RemoveIndex(model_name="knowledgechunk", name="kb_chunk_embedding_hnsw"),
        migrations.AlterField(
            model_name="knowledgechunk",
            name="embedding",
            field=pgvector.django.vector.VectorField(blank=True, dimensions=1024, null=True),
        ),
        migrations.AddIndex(
            model_name="knowledgechunk",
            index=HnswIndex(name="kb_chunk_embedding_hnsw", fields=["embedding"], m=16, ef_construction=64, opclasses=["vector_cosine_ops"]),
        ),
    ]
