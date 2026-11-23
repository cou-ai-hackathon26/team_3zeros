"""Triage response policy, specialty mapping, and output safety validator (INV-7, BACKEND §8.1)."""
import re
from typing import Dict, List, Tuple
from .normalizer import normalize_for_matching

PLACEHOLDER_GUIDANCE_SOURCES: List[Dict[str, str]] = [
    {
        "title": "PLACEHOLDER — NOT CLINICALLY APPROVED: Outpatient Wayfinding Guide",
        "publisher": "Medi Waypoint Pilot Review Board (Pending Q-06)",
        "version": "0.1-placeholder",
    }
]

SPECIALTY_RULES = [
    {
        "code": "pediatrics",
        "en": "Pediatrics",
        "bn": "শিশুরোগ (Pediatrics)",
        "keywords": ["শিশু", "বাচ্চা", "child", "baby", "infant", "pediatric"],
    },
    {
        "code": "cardiology",
        "en": "Cardiology",
        "bn": "হৃদরোগ (Cardiology)",
        "keywords": ["উচ্চ রক্তচাপ", "বুক ধড়ফড়", "হৃদরোগ", "blood pressure", "palpitation", "hypertension", "heart"],
    },
    {
        "code": "dermatology",
        "en": "Dermatology",
        "bn": "চর্মরোগ (Dermatology)",
        "keywords": ["চর্ম", "চুলকানি", "র‍্যাশ", "skin", "rash", "itch", "eczema"],
    },
    {
        "code": "gynecology",
        "en": "Gynecology & Obstetrics",
        "bn": "স্ত্রীরোগ ও প্রসূতিবিদ্যা (Gynecology)",
        "keywords": ["গর্ভ", "মাসিক", "প্রসূতি", "pregnancy", "gyne", "period", "menstrual"],
    },
    {
        "code": "orthopedics",
        "en": "Orthopedics",
        "bn": "অর্থোপেডিকস (Orthopedics)",
        "keywords": ["হাড়", "কোমর", "হাঁটু", "জয়েন্ট", "joint", "knee", "back pain", "fracture"],
    },
]

DEFAULT_SPECIALTY = {
    "code": "general_medicine",
    "en": "General Medicine",
    "bn": "সাধারণ মেডিসিন (General Medicine)",
}

# INV-7: Assistant must never diagnose, prescribe drugs, or suggest doses.
_UNSAFE_OUTPUT_PATTERNS = [
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg|iu|tablet|tablets|capsule|capsules)\b", re.I),
    re.compile(r"\b(?:take|prescribe|dosage|dose of)\s+(?:paracetamol|ibuprofen|antibiotic|amoxicillin|aspirin|naproxen|omeprazole|azithromycin)\b", re.I),
    re.compile(r"\b(?:you have|diagnosed with|diagnosis is|this is clearly)\s+(?:dengue|malaria|typhoid|diabetes|cancer|covid|pneumonia|asthma|ulcer)\b", re.I),
    re.compile(r"(?:ওষুধ খান|ট্যাবলেট খান|ডোজ|রোগ নির্ণয় হয়েছে)", re.I),
]

SAFE_DECLINE_EN = (
    "I cannot diagnose conditions or recommend medicines. "
    "Please review your summary and consult a qualified doctor."
)
SAFE_DECLINE_BN = (
    "আমি রোগ নির্ণয় বা ওষুধের পরামর্শ দিতে পারি না। "
    "অনুগ্রহ করে আপনার সারাংশ যাচাই করে একজন যোগ্য ডাক্তারের পরামর্শ নিন।"
)


def infer_specialty(text: str) -> Dict[str, str]:
    """Return canonical directory specialty code and bilingual labels inferred from symptoms."""
    norm = normalize_for_matching(text)
    for rule in SPECIALTY_RULES:
        if any(kw in norm for kw in rule["keywords"]):
            return {"code": rule["code"], "en": rule["en"], "bn": rule["bn"]}
    return dict(DEFAULT_SPECIALTY)


def validate_assistant_output(
    text: str,
    language: str = "bn",
    intended_policy: str = "question",
) -> Tuple[str, str]:
    """
    Validate assistant text against INV-7 safety rules before sending to the patient.
    Rejects any diagnosis or medication/dosage phrasing and falls back to a safe decline.
    """
    for pattern in _UNSAFE_OUTPUT_PATTERNS:
        if pattern.search(text or ""):
            fallback = SAFE_DECLINE_EN if language == "en" else SAFE_DECLINE_BN
            return fallback, "declined"
    return text, intended_policy
