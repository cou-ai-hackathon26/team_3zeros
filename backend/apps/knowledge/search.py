"""Hybrid search over approved reference passages (MASTERPLAN D-28): pgvector cosine distance and Postgres full-text rank,
merged by reciprocal rank fusion. Citations come from the stored document title and page, never from the model (D-24, D-25).

A passage counts as evidence only if it is similar enough (KNOWLEDGE_MIN_SIMILARITY). If the embedding call fails, only the
full-text side runs; nothing found means the caller's "REFERENCES: none found" path."""
import re
from typing import Dict, List, Optional

from django.conf import settings
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F
from pgvector.django import CosineDistance

from apps.ai.embeddings import embed_query
from .models import KnowledgeChunk

CANDIDATES = 20
RRF_K = 60


def _terms(text: str) -> List[str]:
    return list(dict.fromkeys(w for w in re.findall(r"\w+", text.lower()) if len(w) > 2))[:40]


def _scope(approved_only: bool, document: Optional[str]):
    qs = KnowledgeChunk.objects.select_related("document").filter(document__status="READY")
    if approved_only:
        qs = qs.filter(document__approved=True)
    if document:
        qs = qs.filter(document__public_id=document)
    return qs


def search(query: str, limit: int = 3, *, approved_only: bool = True, document: Optional[str] = None) -> List[Dict]:
    """Best matching passages: [{id, document_name, page_number, relevant_information, score}]."""
    if not query.strip():
        return []
    scope = _scope(approved_only, document)
    ranked: Dict[int, Dict] = {}

    vec = embed_query(query)
    similarity: Dict[int, float] = {}
    if vec is not None:
        near = scope.filter(embedding__isnull=False).annotate(dist=CosineDistance("embedding", vec)).order_by("dist")[:CANDIDATES]
        for rank, chunk in enumerate(near):
            sim = 1.0 - float(chunk.dist)
            if sim < settings.KNOWLEDGE_MIN_SIMILARITY:
                break  # ordered by distance: every later one is less similar still
            similarity[chunk.pk] = sim
            ranked[chunk.pk] = {"chunk": chunk, "score": 1.0 / (RRF_K + rank + 1)}

    terms = _terms(query)
    if terms:
        # OR the words together: a patient's question is long and an AND would match nothing.
        fts = SearchQuery(" | ".join(terms), config="english", search_type="raw")
        hits = scope.filter(search_vector__isnull=False).annotate(rank=SearchRank(F("search_vector"), fts)).filter(search_vector=fts).order_by("-rank")[:CANDIDATES]
        for rank, chunk in enumerate(hits):
            # With vectors available, full-text may only re-rank passages that already passed the similarity bar;
            # without them (embedding unavailable) it stands alone.
            if vec is not None and chunk.pk not in similarity:
                continue
            entry = ranked.setdefault(chunk.pk, {"chunk": chunk, "score": 0.0})
            entry["score"] += 1.0 / (RRF_K + rank + 1)

    best = sorted(ranked.values(), key=lambda e: e["score"], reverse=True)[:limit]
    return [
        {
            "id": e["chunk"].pk,
            "document_name": e["chunk"].document.title,
            "page_number": e["chunk"].page,
            "relevant_information": e["chunk"].text,
            "score": round(e["score"], 5),
        }
        for e in best
    ]
