from decimal import Decimal
from unittest import mock

import pytest
import requests

from apps.ai import chat, usage
from apps.ai.models import LLMUsageDay


def _cerebras_settings(settings, budget=0):
    settings.LLM_PROVIDER, settings.CEREBRAS_API_KEY, settings.LLM_MODEL = "cerebras", "k", "m"
    settings.LLM_DAILY_BUDGET_USD = budget


def _resp(text="ok", prompt=1000, completion=100, cached=0):
    r = mock.Mock()
    r.raise_for_status = lambda: None
    r.json.return_value = {"choices": [{"message": {"content": text}}], "usage": {"prompt_tokens": prompt, "completion_tokens": completion, "prompt_tokens_details": {"cached_tokens": cached}}}
    return r


@pytest.mark.django_db
def test_each_call_records_tokens_by_purpose(settings):
    _cerebras_settings(settings)
    with mock.patch.object(chat.requests, "post", return_value=_resp(prompt=2000, completion=150, cached=1500)):
        assert chat.generate_text([{"role": "user", "text": "hi"}], purpose="dialogue") == "ok"
        chat.generate_text([{"role": "user", "text": "hi"}], purpose="dialogue")
    row = LLMUsageDay.objects.get(purpose="dialogue")
    assert (row.calls, row.prompt_tokens, row.cached_tokens, row.completion_tokens) == (2, 4000, 3000, 300)


def test_cost_uses_the_configured_prices(settings):
    settings.LLM_PRICE_IN_PER_M, settings.LLM_PRICE_OUT_PER_M = 1.0, 2.0
    assert usage.cost_usd(1_000_000, 0, 500_000) == Decimal("2")


@pytest.mark.django_db
def test_calls_stop_once_the_daily_budget_is_spent(settings):
    _cerebras_settings(settings, budget=0.001)
    settings.LLM_PRICE_IN_PER_M, settings.LLM_PRICE_OUT_PER_M = 1.0, 1.0
    with mock.patch.object(chat.requests, "post", return_value=_resp(prompt=2000, completion=0)) as post:
        assert chat.generate_text([{"role": "user", "text": "a"}]) == "ok"  # spends $0.002, over the $0.001 budget
        assert chat.generate_text([{"role": "user", "text": "b"}]) is None  # skipped: callers fall back to scripted text
        assert post.call_count == 1


@pytest.mark.django_db
def test_a_budget_of_zero_means_no_limit(settings):
    _cerebras_settings(settings, budget=0)
    with mock.patch.object(chat.requests, "post", return_value=_resp(prompt=10**9)):
        chat.generate_text([{"role": "user", "text": "a"}])
        assert usage.over_budget() is False


@pytest.mark.django_db
def test_a_busy_provider_is_retried_once_and_other_errors_are_not(settings, monkeypatch):
    _cerebras_settings(settings)
    monkeypatch.setattr(chat.time, "sleep", lambda s: None)
    busy = mock.Mock(status_code=429)
    err = requests.HTTPError(response=busy)
    bad = mock.Mock(); bad.raise_for_status.side_effect = err
    with mock.patch.object(chat.requests, "post", side_effect=[bad, _resp("second try")]) as post:
        assert chat.generate_text([{"role": "user", "text": "a"}]) == "second try"
        assert post.call_count == 2
    unauthorized = requests.HTTPError(response=mock.Mock(status_code=401))
    bad2 = mock.Mock(); bad2.raise_for_status.side_effect = unauthorized
    with mock.patch.object(chat.requests, "post", return_value=bad2) as post:
        assert chat.generate_text([{"role": "user", "text": "a"}]) is None
        assert post.call_count == 1  # a 401 is not retried
