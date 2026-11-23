import re
from typing import Any, Dict, List, Sequence, Tuple
from ..normalizer import normalize_for_matching

# Red-flag symptom lexicons in English and Bangla (Q-06 placeholder until clinician sign-off)
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
NEGATIONS_BN = [r"নেই", r"না\b", r"নাই", r"কোনো .* নেই", r"ব্যথা নেই", r"কষ্ট নেই"]

# Split into clauses so an earlier clause negation ("No fever, but chest pain")
# never suppresses a red flag in a subsequent clause.
_CLAUSE_SPLIT_RE = re.compile(r"[.,;!?।]+|\b(?:but|however|although|yet)\b|(?:কিন্তু|তবে|অথচ)", re.I)


def _split_clauses(text: str) -> List[str]:
    return [c.strip() for c in _CLAUSE_SPLIT_RE.split(text) if c.strip()]


def is_negated(text: str, keyword: str, language: str = "bn") -> bool:
    """Checks if keyword occurrence is negated within its own clause."""
    norm_text = normalize_for_matching(text)
    norm_kw = normalize_for_matching(keyword)

    matching_clauses = [c for c in _split_clauses(norm_text) if norm_kw in c]
    if not matching_clauses:
        return False

    neg_patterns = NEGATIONS_EN if language == "en" else NEGATIONS_BN

    # Only considered negated if EVERY clause mentioning the keyword negates it.
    for clause in matching_clauses:
        kw_pos = clause.find(norm_kw)
        window_start = max(0, kw_pos - 25)
        window_end = min(len(clause), kw_pos + len(norm_kw) + 25)
        window = clause[window_start:window_end]
        if not any(re.search(neg, window) for neg in neg_patterns):
            return False
    return True


def evaluate_red_flags(utterance: str, language: str = "bn") -> Tuple[bool, List[Dict[str, Any]], str]:
    """
    Deterministic red-flag evaluation per MASTERPLAN INV-8, §8.3 / BACKEND §8.3.
    Checks both English and Bangla red-flag lexicons so bilingual / code-switched speech
    never misses a red flag, and returns instruction text in the requested session language.
    """
    norm_utterance = normalize_for_matching(utterance)
    hits: List[Dict[str, Any]] = []
    instruction_text = ""

    for rf in RED_FLAGS:
        matched_kw = None
        matched_lang = language
        for lang_code, kw_list in (("en", rf["keywords_en"]), ("bn", rf["keywords_bn"])):
            for kw in kw_list:
                if normalize_for_matching(kw) in norm_utterance:
                    if not is_negated(norm_utterance, kw, language=lang_code):
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


def evaluate_session_red_flags(
    utterances: Sequence[str],
    language: str = "bn",
) -> Tuple[bool, List[Dict[str, Any]], str]:
    """Evaluate cumulative patient utterances in a session (BACKEND §8.2)."""
    all_hits: List[Dict[str, Any]] = []
    seen_rules = set()
    final_instruction = ""

    for utterance in utterances:
        is_em, hits, instr = evaluate_red_flags(utterance, language=language)
        if is_em:
            for hit in hits:
                if hit["rule_id"] not in seen_rules:
                    seen_rules.add(hit["rule_id"])
                    all_hits.append(hit)
            if not final_instruction and instr:
                final_instruction = instr

    return len(all_hits) > 0, all_hits, final_instruction
