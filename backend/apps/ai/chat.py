"""Plain-text language-model calls (triage replies, caption translation). Returns None when not configured or on failure."""
import logging
import re
from typing import Dict, List, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
_THINK = re.compile(r"<think>.*?</think>", re.S)


def _gemini(messages, system, max_tokens, temperature, key, model) -> str:
    payload = {
        "contents": [{"role": m["role"], "parts": [{"text": m["text"]}]} for m in messages],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }
    if system:
        payload["system_instruction"] = {"parts": [{"text": system}]}
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model or 'gemini-1.5-flash'}:generateContent",
        headers={"x-goog-api-key": key},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def _cerebras(messages, system, max_tokens, temperature, key, model) -> str:
    chat = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "assistant" if m["role"] == "model" else "user", "content": m["text"]} for m in messages
    ]
    resp = requests.post(
        CEREBRAS_URL,
        headers={"Authorization": f"Bearer {key}"},
        # Qwen on Cerebras is a reasoning model; turn reasoning off so the short spoken reply is not
        # swallowed by hidden thinking tokens and the call stays fast.
        json={"model": model, "messages": chat, "max_tokens": max_tokens, "temperature": temperature, "disable_reasoning": True},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"] or ""


_PROVIDERS = {
    "gemini": ("GEMINI_API_KEY", _gemini),
    "cerebras": ("CEREBRAS_API_KEY", _cerebras),
}


def generate_text(
    messages: List[Dict[str, str]], system: str = "", max_tokens: int = 400, temperature: float = 0.2
) -> Optional[str]:
    """`messages` use roles "user" and "model". Runs only when LLM_PROVIDER is gemini or cerebras and its key is set."""
    entry = _PROVIDERS.get(getattr(settings, "LLM_PROVIDER", "mock").lower())
    if not entry:
        return None
    key = getattr(settings, entry[0], "")
    if not key:
        return None
    try:
        text = entry[1](messages, system, max_tokens, temperature, key, getattr(settings, "LLM_MODEL", ""))
        return _THINK.sub("", text).strip() or None
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        logger.warning("language model call failed: %s", exc)
        return None
