"""Caption translation Bangla <-> English (MASTERPLAN D-22). Always machine-labelled by the caller."""
from typing import Optional

from .chat import generate_text

LANG_NAMES = {"bn": "Bangla", "en": "English"}


def translate_text(text: str, source: str, target: str) -> Optional[str]:
    """Return the translation, or None when no provider is configured or it fails (captions then show one language)."""
    if source == target or source not in LANG_NAMES or target not in LANG_NAMES or len(text.strip()) < 3:
        return None
    prompt = (
        f"Translate the following {LANG_NAMES[source]} text to {LANG_NAMES[target]}. "
        "Translate literally. Do not add, remove, explain or give advice. Output only the translation.\n\n" + text
    )
    return generate_text([{"role": "user", "text": prompt}], max_tokens=min(400, 40 + 3 * len(text)), temperature=0, purpose="translate")
