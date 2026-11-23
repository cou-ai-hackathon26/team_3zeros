import re
from typing import List, Dict, Any, Tuple

# Red-flag symptom lexicons in English and Bangla
RED_FLAGS = [
    {
        "id": "RF-CHEST-01",
        "symptom": "chest_pain",
        "keywords_en": ["chest pain", "pressure in chest", "heart attack", "crushing pain"],
        "keywords_bn": ["বুকে ব্যথা", "বুকে চাপ", "বুকে তীব্র ব্যথা", "হার্ট অ্যাটাক"],
        "instruction_en": "Your symptoms indicate possible cardiac emergency. Please call 999 or visit the nearest emergency room immediately.",
        "instruction_bn": "আপনার লক্ষণগুলি জরুরী হৃদরোগের সম্ভাবনা নির্দেশ করে। অবিলম্বে ৯৯৯ নম্বরে কল করুন অথবা নিকটস্থ হাসপাতালের জরুরী বিভাগে যান।",
    },
    {
        "id": "RF-BREATH-01",
        "symptom": "severe_dyspnea",
        "keywords_en": ["severe shortness of breath", "cannot breathe", "gasping for air", "struggling to breathe"],
        "keywords_bn": ["তীব্র শ্বাসকষ্ট", "শ্বাস নিতে পারছি না", "শ্বাস বন্ধ হয়ে আসছে"],
        "instruction_en": "Severe breathing difficulty is a medical emergency. Go to the nearest emergency facility immediately.",
        "instruction_bn": "তীব্র শ্বাসকষ্ট একটি জরুরী অবস্থা। অবিলম্বে নিকটস্থ জরুরী বিভাগে যান।",
    },
    {
        "id": "RF-STROKE-01",
        "symptom": "stroke_symptoms",
        "keywords_en": ["sudden paralysis", "facial drooping", "slurred speech", "weakness in arm"],
        "keywords_bn": ["মুখ বাঁকা হয়ে যাওয়া", "কথা জড়িয়ে যাওয়া", "হঠাৎ অবশ হয়ে যাওয়া", "প্যারালাইসিস"],
        "instruction_en": "Possible stroke symptoms detected. Time is critical. Seek emergency hospital care immediately.",
        "instruction_bn": "স্ট্রোকের লক্ষণ চিহ্নিত হয়েছে। অবিলম্বে জরুরী চিকিৎসার জন্য হাসপাতালে যান।",
    },
    {
        "id": "RF-BLEED-01",
        "symptom": "severe_bleeding",
        "keywords_en": ["coughing up blood", "vomiting blood", "uncontrolled bleeding"],
        "keywords_bn": ["রক্তবমি", "কাশির সাথে রক্ত", "প্রচুর রক্তপাত"],
        "instruction_en": "Severe hemorrhage or vomiting blood requires immediate hospital intervention. Go to emergency now.",
        "instruction_bn": "রক্তবমি বা অতিরিক্ত রক্তপাতের জন্য অবিলম্বে নিকটস্থ জরুরী বিভাগে চিকিৎসা নিন।",
    },
]

NEGATIONS_EN = [r"\bno\b", r"\bnot\b", r"\bdon't have\b", r"\bwithout\b", r"\bdenies\b", r"\bnever\b"]
NEGATIONS_BN = ["নেই", "না", "নাই", "কোনো .* নেই", "ব্যথা নেই", "কষ্ট নেই"]

def is_negated(text: str, keyword: str, language: str = "bn") -> bool:
    """Checks if keyword occurrence in text is preceded or succeeded by a negation marker."""
    text_lower = text.lower()
    kw_pos = text_lower.find(keyword.lower())
    if kw_pos == -1:
        return False

    # Check window of 25 characters around keyword
    window_start = max(0, kw_pos - 25)
    window_end = min(len(text_lower), kw_pos + len(keyword) + 25)
    window = text_lower[window_start:window_end]

    if language == "en":
        for neg in NEGATIONS_EN:
            if re.search(neg, window):
                return True
    else:
        for neg in NEGATIONS_BN:
            if re.search(neg, window):
                return True
    return False


def evaluate_red_flags(utterance: str, language: str = "bn") -> Tuple[bool, List[Dict[str, Any]], str]:
    """
    Deterministic red-flag evaluation per MASTERPLAN INV-8, §8.3 / BACKEND §8.3.
    Checks both English and Bangla red-flag lexicons so bilingual / code-switched speech
    never misses a red flag, and returns instruction text in the requested session language.
    """
    hits = []
    instruction_text = ""

    for rf in RED_FLAGS:
        matched_kw = None
        matched_lang = language
        for lang_code, kw_list in (("en", rf["keywords_en"]), ("bn", rf["keywords_bn"])):
            for kw in kw_list:
                if kw.lower() in utterance.lower():
                    if not is_negated(utterance, kw, language=lang_code):
                        matched_kw = kw
                        matched_lang = lang_code
                        break
            if matched_kw:
                break

        if matched_kw:
            hits.append({
                "rule_id": rf["id"],
                "symptom": rf["symptom"],
                "matched_keyword": matched_kw,
                "language_detected": matched_lang,
            })
            base_instr = rf["instruction_en"] if language == "en" else rf["instruction_bn"]
            if "PLACEHOLDER — NOT CLINICALLY APPROVED" not in base_instr:
                instruction_text = f"PLACEHOLDER — NOT CLINICALLY APPROVED: {base_instr}"
            else:
                instruction_text = base_instr

    is_emergency = len(hits) > 0
    return is_emergency, hits, instruction_text

