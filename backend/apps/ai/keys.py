"""Gemini API keys with fallback (MASTERPLAN D-33).

`GEMINI_API_KEYS` holds several keys, comma separated; `GEMINI_API_KEY` (one key) is still honoured and goes first. A call
tries the keys in order and skips any that is cooling down. A key that is rate limited or exhausted for the day, or that
the provider rejects, is put on a cooldown (shared through the cache) so later calls do not waste time on it, and the
next key is used at once. Keys are never logged: only a short fingerprint."""
import hashlib
import time
from typing import List

from django.conf import settings
from django.core.cache import cache

PER_MINUTE_COOLDOWN = 65     # a per-minute limit clears within the minute
PER_DAY_COOLDOWN = 3600      # a daily quota is re-checked hourly with one cheap request
REJECTED_COOLDOWN = 3600     # a revoked or wrong key is retried hourly in case it was fixed


def gemini_keys() -> List[str]:
    keys = [k.strip() for k in (getattr(settings, "GEMINI_API_KEYS", "") or "").split(",") if k.strip()]
    single = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    if single:
        keys = [single] + [k for k in keys if k != single]  # the single key always goes first
    return keys


def fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:8]


def _slot(key: str) -> str:
    return f"gemini-cool:{fingerprint(key)}"


def cool_down(key: str, seconds: int) -> None:
    cache.set(_slot(key), time.time() + seconds, seconds)


def cooling_until(key: str) -> float:
    return cache.get(_slot(key)) or 0.0


def available(keys: List[str]) -> List[str]:
    now = time.time()
    return [k for k in keys if cooling_until(k) <= now]


def seconds_until_any_available(keys: List[str]) -> float:
    now = time.time()
    return max(0.0, min((cooling_until(k) for k in keys), default=now) - now)


def cooldown_for(status_code: int, body: str) -> int:
    """How long to leave a key alone after this answer."""
    if status_code == 429:
        text = body.lower()
        return PER_DAY_COOLDOWN if ("perday" in text or "per day" in text or "daily" in text) else PER_MINUTE_COOLDOWN
    return REJECTED_COOLDOWN  # 400 "API key not valid", 401, 403
