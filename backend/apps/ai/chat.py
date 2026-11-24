"""Plain-text language-model calls (triage replies, caption translation). Returns None when not configured or on failure."""
import logging
import time
import re
from typing import Dict, List, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
_THINK = re.compile(r"<think>.*?</think>", re.S)


def _gemini(messages, system, max_tokens, temperature, key, model, timeout):
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
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"], None


def _cerebras(messages, system, max_tokens, temperature, key, model, timeout):
    chat = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "assistant" if m["role"] == "model" else "user", "content": m["text"]} for m in messages
    ]
    resp = requests.post(
        CEREBRAS_URL,
        headers={"Authorization": f"Bearer {key}"},
        # Qwen on Cerebras is a reasoning model; turn reasoning off so the short spoken reply is not
        # swallowed by hidden thinking tokens and the call stays fast.
        json={"model": model, "messages": chat, "max_tokens": max_tokens, "temperature": temperature, "disable_reasoning": True},
        timeout=timeout,
    )
    resp.raise_for_status()
    body = resp.json()
    return body["choices"][0]["message"]["content"] or "", body.get("usage")


_PROVIDERS = {
    "gemini": ("GEMINI_API_KEY", _gemini),
    "cerebras": ("CEREBRAS_API_KEY", _cerebras),
}


def generate_text(
    messages: List[Dict[str, str]], system: str = "", max_tokens: int = 400, temperature: float = 0.2, timeout: int = 15, purpose: str = "other"
) -> Optional[str]:
    """`messages` use roles "user" and "model". Runs only when LLM_PROVIDER is gemini or cerebras and its key is set."""
    entry = _PROVIDERS.get(getattr(settings, "LLM_PROVIDER", "mock").lower())
    if not entry:
        return None
    key = getattr(settings, entry[0], "")
    if not key:
        return None
    from . import usage

    if usage.over_budget():
        return None  # callers fall back to their scripted behaviour
    try:
        try:
            text, used = entry[1](messages, system, max_tokens, temperature, key, getattr(settings, "LLM_MODEL", ""), timeout)
        except requests.HTTPError as exc:
            # A busy provider (429/503) is retried once after a short pause; rejected calls are not billed.
            if exc.response is None or exc.response.status_code not in (429, 503):
                raise
            time.sleep(1.5)
            text, used = entry[1](messages, system, max_tokens, temperature, key, getattr(settings, "LLM_MODEL", ""), timeout)
        usage.record(purpose, used)
        return _THINK.sub("", text).strip() or None
    except (requests.RequestException, KeyError, IndexError, ValueError) as exc:
        logger.warning("language model call failed: %s", exc)
        return None
