from typing import Protocol, List, Dict, Any
from apps.common.exceptions import ValidationError

class LLMAdapter(Protocol):
    def generate(self, schema: Dict[str, Any], messages: List[Dict[str, str]], max_tokens: int = 1000) -> Dict[str, Any]:
        ...

class OCRAdapter(Protocol):
    def extract(self, file_bytes: bytes) -> List[Dict[str, Any]]:
        ...

def validate_referral_draft_schema(draft: Dict[str, Any]) -> None:
    """
    Enforces BACKEND §10.3:
    Every statement must carry source_refs unless in missing/uncertain info section.
    Rejects placeholder values like 'N/A' invented by models.
    """
    if not isinstance(draft, dict):
        raise ValidationError("Draft must be a JSON object.")

    sections = draft.get("sections", [])
    if not isinstance(sections, list):
        raise ValidationError("Draft must contain a 'sections' list.")

    for sec in sections:
        sec_name = sec.get("name", "")
        statements = sec.get("statements", [])
        is_missing_info_section = "missing" in sec_name.lower() or "uncertain" in sec_name.lower()

        for st in statements:
            text = st.get("text", "")
            if text in ("N/A", "NA", "None", "Unknown", "placeholder"):
                raise ValidationError(f"Invalid model-invented placeholder '{text}'. Use null instead.")

            refs = st.get("source_refs", [])
            if not is_missing_info_section and not refs:
                raise ValidationError(
                    f"Statement '{text}' in section '{sec_name}' is missing source_refs."
                )


class MockLLMAdapter:
    """Mock LLM adapter for deterministic tests and offline execution."""
    def generate(self, schema: Dict[str, Any], messages: List[Dict[str, str]], max_tokens: int = 1000) -> Dict[str, Any]:
        return {
            "sections": [
                {
                    "name": "Reason for Referral",
                    "statements": [
                        {
                            "text": "Patient has persistent cough and fever.",
                            "source_refs": ["document:uuid-123#page=1"],
                        }
                    ],
                },
                {
                    "name": "Missing or Uncertain Information",
                    "statements": [
                        {
                            "text": "Previous tuberculosis history unconfirmed.",
                            "source_refs": [],
                        }
                    ],
                },
            ]
        }
