"""Token accounting and the daily spend guard for paid language models.

Every call records its tokens. When LLM_DAILY_BUDGET_USD is above zero and today's estimated spend has reached it, model
calls are skipped and the callers fall back to their scripted behaviour, so a small prepaid balance cannot run out
silently. Prices are settings, because they change; the defaults are third-party listings for qwen-3.8-27b on Cerebras."""
import logging
from decimal import Decimal
from typing import Dict, Optional

from django.conf import settings
from django.db.models import F, Sum
from django.utils import timezone

from .models import LLMUsageDay

logger = logging.getLogger(__name__)


def record(purpose: str, usage: Optional[Dict]) -> None:
    if not usage:
        return
    prompt = int(usage.get("prompt_tokens") or 0)
    cached = int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
    completion = int(usage.get("completion_tokens") or 0)
    row, _ = LLMUsageDay.objects.get_or_create(day=timezone.localdate(), purpose=purpose)
    LLMUsageDay.objects.filter(pk=row.pk).update(
        calls=F("calls") + 1, prompt_tokens=F("prompt_tokens") + prompt, cached_tokens=F("cached_tokens") + cached, completion_tokens=F("completion_tokens") + completion
    )
    logger.info("llm usage purpose=%s prompt=%d cached=%d completion=%d", purpose, prompt, cached, completion)


def cost_usd(prompt_tokens: int, cached_tokens: int, completion_tokens: int) -> Decimal:
    p_in = Decimal(str(getattr(settings, "LLM_PRICE_IN_PER_M", 0.99)))
    p_out = Decimal(str(getattr(settings, "LLM_PRICE_OUT_PER_M", 1.49)))
    # Cached prompt tokens are billed as normal input here: a safe over-estimate.
    return (Decimal(prompt_tokens) * p_in + Decimal(completion_tokens) * p_out) / Decimal(1_000_000)


def spent_today() -> Decimal:
    t = LLMUsageDay.objects.filter(day=timezone.localdate()).aggregate(p=Sum("prompt_tokens"), c=Sum("cached_tokens"), o=Sum("completion_tokens"))
    return cost_usd(t["p"] or 0, t["c"] or 0, t["o"] or 0)


def over_budget() -> bool:
    budget = Decimal(str(getattr(settings, "LLM_DAILY_BUDGET_USD", 0) or 0))
    if budget <= 0:
        return False
    if spent_today() >= budget:
        logger.warning("llm daily budget of $%s reached; model calls are skipped until tomorrow", budget)
        return True
    return False
