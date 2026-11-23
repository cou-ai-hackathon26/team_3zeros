"""Keyword search over approved reference chunks (TF-IDF style, inverted index kept in memory).
Citations come from the stored document name and page, never from the model (D-24)."""
import math
import re
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Tuple

from django.db.models import Count, Max

from .models import KnowledgeChunk, KnowledgeDocument

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


class _Index:
    def __init__(self, signature: Tuple):
        self.signature = signature
        rows = list(KnowledgeChunk.objects.filter(document__approved=True).values_list("document__title", "page", "text"))
        self.rows = rows
        self.lengths: List[int] = []
        self.postings: Dict[str, List[Tuple[int, int]]] = defaultdict(list)
        for i, (_, _, text) in enumerate(rows):
            counts = Counter(tokens(text))
            self.lengths.append(sum(counts.values()) or 1)
            for term, tf in counts.items():
                self.postings[term].append((i, tf))


_index: Optional[_Index] = None


def _signature() -> Tuple:
    approved = tuple(KnowledgeDocument.objects.filter(approved=True).order_by("id").values_list("id", flat=True))
    agg = KnowledgeChunk.objects.filter(document__approved=True).aggregate(n=Count("id"), top=Max("id"))
    return approved, agg["n"], agg["top"]


def reset_index() -> None:
    global _index
    _index = None


def _current_index() -> _Index:
    """Rebuilt only when the set of approved documents or their passages changes."""
    global _index
    sig = _signature()
    if _index is None or _index.signature != sig:
        _index = _Index(sig)
    return _index


def search(query: str, limit: int = 3) -> List[Dict]:
    """Best matching approved passages: [{document_name, page_number, relevant_information}]."""
    q = Counter(tokens(query))
    if not q:
        return []
    idx = _current_index()
    n = len(idx.rows)
    if not n:
        return []
    scores: Dict[int, float] = defaultdict(float)
    for term, qc in q.items():
        posts = idx.postings.get(term)
        if not posts:
            continue
        weight = math.log(1 + n / len(posts)) * (1 + math.log(qc))
        for i, tf in posts:
            scores[i] += (tf / idx.lengths[i]) ** 0.5 * weight
    best = sorted(((s, i) for i, s in scores.items() if s >= MIN_SCORE), reverse=True)[:limit]
    return [
        {"document_name": idx.rows[i][0], "page_number": idx.rows[i][1], "relevant_information": idx.rows[i][2]}
        for _, i in best
    ]
