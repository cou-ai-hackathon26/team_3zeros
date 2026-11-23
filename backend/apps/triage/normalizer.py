"""Deterministic Bangla/English text normalization for triage (BACKEND §8.1)."""
import re
import unicodedata

_BANGLA_TO_LATIN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_bangla_digits(text: str) -> str:
    """Convert Bangla numerals (০-৯) to Latin digits (0-9) while keeping all other characters."""
    return text.translate(_BANGLA_TO_LATIN_DIGITS)


def normalize_text(text: str) -> str:
    """NFC-normalize Unicode and collapse repeated whitespace for deterministic matching."""
    nfc = unicodedata.normalize("NFC", text or "")
    return _WHITESPACE_RE.sub(" ", nfc).strip()


def normalize_for_matching(text: str) -> str:
    """Normalize text for case-insensitive rule/keyword matching."""
    return normalize_bangla_digits(normalize_text(text)).lower()
