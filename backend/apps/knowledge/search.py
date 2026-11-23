"""Keyword search over approved reference chunks (TF-IDF style). Citations come from the stored
document name and page, never from the model (D-24)."""
import math
import re
from collections import Counter
from typing import Dict, List

from .models import KnowledgeChunk

_WORD = re.compile(r"\w+", re.UNICODE)
MIN_SCORE = 0.05


def tokens(text: str) -> List[str]:
    return [w for w in _WORD.findall(text.lower()) if len(w) > 2 or not w.isascii()]


def chunk_text(text: str, size: int = 900) -> List[str]:
    """Split a page into pieces of about `size` characters on sentence-ish boundaries."""
    parts, cur = [], ""
    for piece in re.split(r"(?<=[.!?।])\s+", text.strip()):
        if cur and len(cur) + len(piece) > size:
            parts.append(cur.strip())
            cur = ""
        cur += piece + " "
    if cur.strip():
        parts.append(cur.strip())
    return parts


def search(query: str, limit: int = 3) -> List[Dict]:
    """Best matching approved passages: [{document_name, page_number, relevant_information}]."""
    q = Counter(tokens(query))
    if not q:
        return []
    chunks = list(KnowledgeChunk.objects.filter(document__approved=True).select_related("document"))
    if not chunks:
        return []
    docs_tokens = [Counter(tokens(c.text)) for c in chunks]
    n = len(chunks)
    df = Counter(t for dt in docs_tokens for t in dt)
    scored = []
    for chunk, dt in zip(chunks, docs_tokens):
        length = sum(dt.values()) or 1
        score = sum(
            (dt[t] / length) ** 0.5 * math.log(1 + n / df[t]) * (1 + math.log(qc))
            for t, qc in q.items()
            if t in dt
        )
        if score >= MIN_SCORE:
            scored.append((score, chunk))
    scored.sort(key=lambda s: s[0], reverse=True)
    return [
        {"document_name": c.document.title, "page_number": c.page, "relevant_information": c.text}
        for _, c in scored[:limit]
    ]
