"""Text embeddings for knowledge-base search (MASTERPLAN D-33, Q-12).

Providers, chosen with EMBEDDING_PROVIDER, return normalised 1,024-number vectors so cosine distance is meaningful:
  gemini  Google's gemini-embedding-001 cut to 1,024 dimensions. Several keys can be listed (GEMINI_API_KEYS) and are used as
          fallbacks: a key that is rate limited, out of daily quota or rejected is skipped and the next one is tried.
  mock    word-hash vectors, so tests stay offline.
Vectors from different models are never compared: each document records the model that embedded it (`model_id`)."""
import hashlib
import logging
import math
import re
import time
from typing import List, Optional

import requests
from django.conf import settings
from django.core.cache import cache

from .keys import available, cool_down, cooldown_for, fingerprint, gemini_keys, seconds_until_any_available

logger = logging.getLogger(__name__)

DIMENSIONS = 1024
BATCH = 16  # small batches stay under per-minute token limits
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


class EmbeddingError(Exception):
    """The provider could not embed the text (no key, quota, outage). Callers fall back to full-text search."""


DEFAULT_MODELS = {"gemini": "gemini-embedding-001", "mock": "mock"}


def provider() -> str:
    return getattr(settings, "EMBEDDING_PROVIDER", "gemini")


def model_name() -> str:
    return getattr(settings, "EMBEDDING_MODEL", "") or DEFAULT_MODELS.get(provider(), "")


def model_id() -> str:
    """Identifies the vector space, e.g. "gemini:gemini-embedding-001". A document is searched by vector only when this matches its own."""
    return f"{provider()}:{model_name()}"


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
    keys = gemini_keys()
    if not keys:
        raise EmbeddingError("No Gemini key is set (GEMINI_API_KEYS or GEMINI_API_KEY).")
    model = model_name()
    body = {"requests": [{"model": f"models/{model}", "content": {"parts": [{"text": t}]}, "taskType": task_type, "outputDimensionality": DIMENSIONS} for t in texts]}
    last = "no key could be used"
    for attempt in range(8):
        usable = available(keys)
        if not usable:
            # Every key is cooling down: wait for the soonest one (never longer than a minute at a time) and try again.
            time.sleep(min(max(seconds_until_any_available(keys), 1.0), 70.0))
            continue
        for key in usable:
            try:
                resp = requests.post(GEMINI_URL.format(model=model), headers={"x-goog-api-key": key}, json=body, timeout=90)
            except requests.RequestException as exc:
                last = f"connection failed ({type(exc).__name__})"
                continue  # a dropped connection is usually brief: try the next key, then retry the round
            if resp.status_code == 200:
                data = resp.json().get("embeddings") or []
                if len(data) != len(texts):
                    raise EmbeddingError("Embedding provider returned the wrong number of vectors.")
                return [_normalise(e["values"]) for e in data]
            last = f"key {fingerprint(key)} answered {resp.status_code}"
            if resp.status_code in (400, 401, 403, 429):
                cool_down(key, cooldown_for(resp.status_code, resp.text))
                logger.warning("gemini embedding: %s; trying the next key", last)
                continue
            if resp.status_code in (500, 502, 503):
                continue  # provider hiccup: next key, then retry the round
            raise EmbeddingError(f"Embedding provider answered {resp.status_code}.")
        if attempt < 7 and available(keys):
            time.sleep(min(2.0 * (attempt + 1), 20.0))  # brief pause after a failed round
    raise EmbeddingError(f"Embedding failed on every Gemini key ({last}). Retry later or add another key.")


def embed_texts(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[List[float]]:
    """Embed many texts (batches of 100). Raises EmbeddingError on failure."""
    if provider() == "mock":
        return _mock(texts)
    vectors: List[List[float]] = []
    for i in range(0, len(texts), BATCH):
        vectors.extend(_gemini_batch(texts[i:i + BATCH], task_type))
    return vectors


def embed_query(text: str) -> Optional[List[float]]:
    """One search question, cached by hash. None when embedding is unavailable (callers use full-text only)."""
    key = f"emb-q:{model_id()}:" + hashlib.sha256(text.encode()).hexdigest()
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
