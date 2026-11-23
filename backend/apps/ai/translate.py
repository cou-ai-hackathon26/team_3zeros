"""Caption translation Bangla <-> English (MASTERPLAN D-22). Always machine-labelled by the caller."""
import logging
from typing import Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

LANG_NAMES = {"bn": "Bangla", "en": "English"}


def translate_text(text: str, source: str, target: str) -> Optional[str]:
    """Return the translation, or None when no provider is configured or it fails (captions then show one language)."""
    if source == target or source not in LANG_NAMES or target not in LANG_NAMES:
        return None
    key = getattr(settings, "GEMINI_API_KEY", "")
    if getattr(settings, "LLM_PROVIDER", "mock").lower() != "gemini" or not key:
        return None
    model = getattr(settings, "LLM_MODEL", "") or "gemini-1.5-flash"
    prompt = (
        f"Translate the following {LANG_NAMES[source]} text to {LANG_NAMES[target]}. "
        "Translate literally. Do not add, remove, explain or give advice. Output only the translation.\n\n" + text
    )
    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key},
            json={"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0, "maxOutputTokens": 400}},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip() or None
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        logger.warning("caption translation failed: %s", exc)
        return None
