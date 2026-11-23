"""Plain-text Gemini calls (chat replies, translation). Returns None when not configured or on any failure."""
import logging
from typing import Dict, List, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def gemini_generate_text(
    messages: List[Dict[str, str]], system: str = "", max_tokens: int = 400, temperature: float = 0.2
) -> Optional[str]:
    """`messages` use roles "user" and "model". Only runs when LLM_PROVIDER=gemini and a key is set."""
    key = getattr(settings, "GEMINI_API_KEY", "")
    if getattr(settings, "LLM_PROVIDER", "mock").lower() != "gemini" or not key:
        return None
    model = getattr(settings, "LLM_MODEL", "") or "gemini-1.5-flash"
    payload = {
        "contents": [{"role": m["role"], "parts": [{"text": m["text"]}]} for m in messages],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if system:
        payload["system_instruction"] = {"parts": [{"text": system}]}
    try:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key},
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip() or None
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        logger.warning("gemini text generation failed: %s", exc)
        return None
