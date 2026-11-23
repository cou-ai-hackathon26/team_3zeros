"""Sign-in security helpers: TOTP (RFC 6238) for MFA and attempt limits (MASTERPLAN D-17, audit A-02)."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from django.core.cache import cache

from apps.common.exceptions import BaseAPIException
from rest_framework import status

ATTEMPT_LIMIT = 5
ATTEMPT_WINDOW = 15 * 60  # seconds


class RateLimitedError(BaseAPIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    default_message = "Too many attempts. Try again in a few minutes."


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp_code(secret: str, at: float | None = None, step: int = 30, digits: int = 6) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    counter = int((time.time() if at is None else at) // step)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(number).zfill(digits)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    if not secret or not code:
        return False
    now = time.time()
    return any(hmac.compare_digest(totp_code(secret, now + drift * 30), code.strip()) for drift in range(-window, window + 1))


def totp_uri(secret: str, account: str, issuer: str = "Medi Waypoint") -> str:
    return f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret}&issuer={quote(issuer)}"


# --- attempt limits (cache-backed; production must use a shared cache such as Redis) ---

def assert_not_locked(key: str) -> None:
    if (cache.get(f"attempts:{key}") or 0) >= ATTEMPT_LIMIT:
        raise RateLimitedError()


def register_failure(key: str) -> None:
    k = f"attempts:{key}"
    cache.add(k, 0, ATTEMPT_WINDOW)
    try:
        cache.incr(k)
    except ValueError:
        cache.set(k, 1, ATTEMPT_WINDOW)


def clear_failures(key: str) -> None:
    cache.delete(f"attempts:{key}")
