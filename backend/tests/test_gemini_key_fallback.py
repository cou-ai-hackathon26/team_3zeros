"""Several Gemini keys, used as fallbacks (MASTERPLAN D-33): a limited or rejected key is skipped, the next one answers."""
import time
from unittest import mock

import pytest
import requests

from apps.ai import chat, embeddings as emb, keys
from apps.ai.embeddings import EmbeddingError


def _resp(status=200, text="", vectors=1):
    r = mock.Mock()
    r.status_code = status
    r.text = text
    r.headers = {}
    r.json.return_value = {"embeddings": [{"values": [1.0] + [0.0] * (emb.DIMENSIONS - 1)} for _ in range(vectors)]}
    return r


@pytest.fixture
def gemini(settings, monkeypatch):
    settings.EMBEDDING_PROVIDER = "gemini"
    settings.GEMINI_API_KEYS = "key-b, key-c"
    settings.GEMINI_API_KEY = "key-a"
    monkeypatch.setattr(emb.time, "sleep", lambda s: None)
    return settings


def _calls(post):
    return [c.kwargs["headers"]["x-goog-api-key"] for c in post.call_args_list]


def test_keys_come_from_both_settings_in_order_without_duplicates(settings):
    settings.GEMINI_API_KEY, settings.GEMINI_API_KEYS = "key-a", "key-b, key-a ,, key-c"
    assert keys.gemini_keys() == ["key-a", "key-b", "key-c"]
    settings.GEMINI_API_KEY, settings.GEMINI_API_KEYS = "", ""
    assert keys.gemini_keys() == []


def test_the_first_key_is_used_while_it_works(gemini):
    with mock.patch.object(emb.requests, "post", return_value=_resp()) as post:
        assert len(emb.embed_texts(["x"])[0]) == emb.DIMENSIONS
    assert _calls(post) == ["key-a"]


def test_a_rate_limited_key_is_skipped_at_once_and_stays_skipped(gemini):
    with mock.patch.object(emb.requests, "post", side_effect=[_resp(429, "rate limit"), _resp()]) as post:
        emb.embed_texts(["x"])
    assert _calls(post) == ["key-a", "key-b"]  # no waiting on key-a: the next key answered immediately
    with mock.patch.object(emb.requests, "post", return_value=_resp()) as post2:
        emb.embed_texts(["y"])
    assert _calls(post2) == ["key-b"]  # key-a is still cooling down


def test_a_daily_quota_cools_the_key_for_much_longer_than_a_minute(gemini):
    body = '{"error": {"message": "Quota exceeded for metric ... PerDayPerProjectPerModel-FreeTier"}}'
    with mock.patch.object(emb.requests, "post", side_effect=[_resp(429, body), _resp()]):
        emb.embed_texts(["x"])
    assert keys.cooling_until("key-a") - time.time() > 1800


def test_a_wrong_or_revoked_key_is_skipped(gemini):
    with mock.patch.object(emb.requests, "post", side_effect=[_resp(400, "API key not valid"), _resp(403, "forbidden"), _resp()]) as post:
        emb.embed_texts(["x"])
    assert _calls(post) == ["key-a", "key-b", "key-c"]


def test_a_provider_hiccup_moves_on_without_cooling_the_key(gemini):
    with mock.patch.object(emb.requests, "post", side_effect=[_resp(503), _resp()]):
        emb.embed_texts(["x"])
    assert keys.cooling_until("key-a") == 0


def test_a_dropped_connection_moves_on_to_the_next_key(gemini):
    with mock.patch.object(emb.requests, "post", side_effect=[requests.ConnectionError("down"), _resp()]) as post:
        emb.embed_texts(["x"])
    assert _calls(post) == ["key-a", "key-b"]


def test_when_every_key_fails_it_raises_an_embedding_error_that_never_shows_a_key(gemini):
    with mock.patch.object(emb.requests, "post", return_value=_resp(429, "limit")):
        with pytest.raises(EmbeddingError) as exc:
            emb.embed_texts(["x"])
    assert "key-a" not in str(exc.value) and "key-b" not in str(exc.value)


def test_with_no_key_at_all_it_says_so(settings):
    settings.EMBEDDING_PROVIDER = "gemini"
    with pytest.raises(EmbeddingError, match="No Gemini key"):
        emb.embed_texts(["x"])


def test_a_key_that_was_cooling_is_used_again_once_the_cooldown_passes(gemini):
    from django.core.cache import cache
    keys.cool_down("key-a", 600)
    assert keys.available(["key-a", "key-b"]) == ["key-b"]
    cache.set(keys._slot("key-a"), time.time() - 1, 600)  # the cooldown's end time has passed
    assert keys.available(["key-a", "key-b"]) == ["key-a", "key-b"]


# --- Gemini chat uses the same keys -----------------------------------------------------------------------------

@pytest.mark.django_db
def test_gemini_chat_falls_back_across_keys(settings):
    settings.LLM_PROVIDER, settings.LLM_MODEL = "gemini", "gemini-test"
    settings.GEMINI_API_KEY, settings.GEMINI_API_KEYS = "key-a", "key-b"
    refused = mock.Mock(status_code=429, text="rate limit")
    bad = mock.Mock()
    bad.raise_for_status.side_effect = requests.HTTPError(response=refused)
    good = mock.Mock()
    good.raise_for_status = lambda: None
    good.json.return_value = {"candidates": [{"content": {"parts": [{"text": "hello"}]}}]}
    with mock.patch.object(chat.requests, "post", side_effect=[bad, good]) as post:
        assert chat.generate_text([{"role": "user", "text": "hi"}]) == "hello"
    assert [c.kwargs["headers"]["x-goog-api-key"] for c in post.call_args_list] == ["key-a", "key-b"]
    assert keys.cooling_until("key-a") > time.time()


@pytest.mark.django_db
def test_gemini_chat_returns_none_when_every_key_is_refused(settings):
    settings.LLM_PROVIDER, settings.LLM_MODEL = "gemini", "gemini-test"
    settings.GEMINI_API_KEY, settings.GEMINI_API_KEYS = "key-a", "key-b"
    refused = mock.Mock(status_code=403, text="denied")
    bad = mock.Mock()
    bad.raise_for_status.side_effect = requests.HTTPError(response=refused)
    with mock.patch.object(chat.requests, "post", return_value=bad):
        assert chat.generate_text([{"role": "user", "text": "hi"}]) is None
