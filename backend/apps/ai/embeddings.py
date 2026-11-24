"""Text embeddings for knowledge-base search (MASTERPLAN D-28, Q-12).

Gemini `gemini-embedding-001` truncated to 768 dimensions and normalised, so cosine distance is meaningful. The provider
sees book text when a document is ingested and de-identified symptom text when a question is searched (SECURITY §8).
A "mock" provider (word-hash vectors) keeps tests offline."""
import hashlib
import logging
import math
import re
import time
from typing import List, Optional

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

DIMENSIONS = 768
BATCH = 25  # about 8k tokens a request: small enough for per-minute token limits
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


class EmbeddingError(Exception):
    """The provider could not embed the text (no key, quota, outage). Callers fall back to full-text search."""


def _normalise(vec: List[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _mock(texts: List[str]) -> List[List[float]]:
    out = []
    for text in texts:
        vec = [0.0] * DIMENSIONS
        for word in re.findall(r"\w+", text.lower()):
            vec[int(hashlib.md5(word.encode()).hexdigest(), 16) % DIMENSIONS] += 1.0
        out.append(_normalise(vec))
    return out


def _gemini_batch(texts: List[str], task_type: str) -> List[List[float]]:
    key = getattr(settings, "GEMINI_API_KEY", "")
    if not key:
        raise EmbeddingError("GEMINI_API_KEY is not set.")
    model = settings.EMBEDDING_MODEL
    body = {"requests": [{"model": f"models/{model}", "content": {"parts": [{"text": t}]}, "taskType": task_type, "outputDimensionality": DIMENSIONS} for t in texts]}
    delay = 5.0
    for attempt in range(8):
        try:
            resp = requests.post(GEMINI_URL.format(model=model), headers={"x-goog-api-key": key}, json=body, timeout=90)
        except requests.RequestException as exc:
            if attempt < 7:  # a dropped connection is usually brief: wait and try the same batch again
                time.sleep(min(delay, 70))
                delay = min(delay * 2, 70)
                continue
            raise EmbeddingError(f"Embedding request failed: {exc}")
        if resp.status_code in (429, 500, 502, 503) and attempt < 7:
            # Rate limits are per minute: wait out the window (or what the provider asks for) and try again.
            wait = float(resp.headers.get("Retry-After") or delay)
            time.sleep(min(wait, 70))
            delay = min(delay * 2, 70)
            continue
        if resp.status_code != 200:
            raise EmbeddingError(f"Embedding provider answered {resp.status_code}.")
        data = resp.json().get("embeddings") or []
        if len(data) != len(texts):
            raise EmbeddingError("Embedding provider returned the wrong number of vectors.")
        return [_normalise(e["values"]) for e in data]
    raise EmbeddingError("Embedding provider stayed busy.")


def embed_texts(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[List[float]]:
    """Embed many texts (batches of 100). Raises EmbeddingError on failure."""
    if getattr(settings, "EMBEDDING_PROVIDER", "gemini") == "mock":
        return _mock(texts)
    vectors: List[List[float]] = []
    for i in range(0, len(texts), BATCH):
        vectors.extend(_gemini_batch(texts[i:i + BATCH], task_type))
    return vectors


def embed_query(text: str) -> Optional[List[float]]:
    """One search question, cached by hash. None when embedding is unavailable (callers use full-text only)."""
    key = "emb-q:" + hashlib.sha256(text.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        vec = embed_texts([text], "RETRIEVAL_QUERY")[0]
    except EmbeddingError as exc:
        logger.warning("query embedding unavailable, using full-text only: %s", exc)
        return None
    cache.set(key, vec, 3600)
    return vec
