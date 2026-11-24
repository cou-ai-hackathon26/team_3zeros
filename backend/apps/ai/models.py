from django.db import models


class LLMUsageDay(models.Model):
    """Tokens used and estimated spend per day and purpose, so a small prepaid balance cannot be burned unnoticed."""

    day = models.DateField(db_index=True)
    purpose = models.CharField(max_length=30, default="other")
    calls = models.PositiveIntegerField(default=0)
    prompt_tokens = models.PositiveBigIntegerField(default=0)
    cached_tokens = models.PositiveBigIntegerField(default=0)
    completion_tokens = models.PositiveBigIntegerField(default=0)

    class Meta:
        unique_together = ("day", "purpose")
        ordering = ["-day", "purpose"]
