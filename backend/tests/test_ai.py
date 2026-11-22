import pytest
from apps.ai.adapters import validate_referral_draft_schema, MockLLMAdapter
from apps.common.exceptions import ValidationError

def test_referral_draft_schema_validation_success():
    valid_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "Suspected pulmonary tuberculosis.",
                        "source_refs": ["document:uuid-abc#page=1"],
                    }
                ],
            },
            {
                "name": "Missing or Uncertain Information",
                "statements": [
                    {
                        "text": "Sputum test date unknown.",
                        "source_refs": [],
                    }
                ],
            },
        ]
    }
    # Should not raise
    validate_referral_draft_schema(valid_draft)

def test_referral_draft_schema_rejects_missing_source_refs():
    invalid_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "Suspected diabetes mellitus.",
                        "source_refs": [],  # Missing source_refs outside missing info section!
                    }
                ],
            }
        ]
    }
    with pytest.raises(ValidationError) as exc:
        validate_referral_draft_schema(invalid_draft)
    assert "missing source_refs" in str(exc.value)

def test_referral_draft_schema_rejects_invented_placeholders():
    placeholder_draft = {
        "sections": [
            {
                "name": "Clinical Reason",
                "statements": [
                    {
                        "text": "N/A",  # Model invented placeholder!
                        "source_refs": ["document:uuid-123"],
                    }
                ],
            }
        ]
    }
    with pytest.raises(ValidationError) as exc:
        validate_referral_draft_schema(placeholder_draft)
    assert "Invalid model-invented placeholder" in str(exc.value)

def test_mock_llm_adapter():
    adapter = MockLLMAdapter()
    result = adapter.generate(schema={}, messages=[])
    assert "sections" in result
    validate_referral_draft_schema(result)
