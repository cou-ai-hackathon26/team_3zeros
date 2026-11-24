"""
OCR text extraction, structured clinical field parsing, Medical Book RAG report
analysis, and longitudinal patient report history summarization for referrals
(MASTERPLAN INV-7, INV-15, D-24, D-25).

Safety rules enforced here:
- AI never diagnoses, prescribes, or replaces clinician verification (INV-7).
- Medical references come strictly from clinician-approved passages in
  `apps.knowledge.search.search` (document name + page number).
- Referral report history summaries rest strictly on the patient's uploaded/analyzed
  reports and verified observations — never invented facts.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
import subprocess
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

from apps.ai.chat import generate_text
from apps.knowledge.search import search as search_knowledge
from apps.triage.policy import validate_assistant_output

logger = logging.getLogger(__name__)

VALID_INTERPRETATIONS = {"normal", "abnormal", "positive", "negative", "high", "low", "unknown"}
ABNORMAL_INTERPRETATIONS = {"positive", "abnormal", "high", "low"}
NORMAL_INTERPRETATIONS = {"negative", "normal"}

REPORT_DISCLAIMER = (
    "This AI-assisted report summary is for reference and care continuity only. "
    "It is not a confirmed medical diagnosis and requires review by a qualified clinician."
)

# Common diagnostic lab ranges used purely for draft flag hints (always clinician-verified).
_COMMON_NUMERIC_RANGES: Dict[str, Tuple[float, float, str]] = {
    "hemoglobin": (12.0, 17.5, "12.0–17.5 g/dL"),
    "hb": (12.0, 17.5, "12.0–17.5 g/dL"),
    "wbc": (4000.0, 11000.0, "4,000–11,000 /cumm"),
    "wbc count": (4000.0, 11000.0, "4,000–11,000 /cumm"),
    "platelet": (150000.0, 450000.0, "150,000–450,000 /cumm"),
    "platelet count": (150000.0, 450000.0, "150,000–450,000 /cumm"),
    "fasting blood sugar": (3.9, 6.1, "3.9–6.1 mmol/L"),
    "fbs": (3.9, 6.1, "3.9–6.1 mmol/L"),
    "blood sugar": (3.9, 7.8, "3.9–7.8 mmol/L"),
    "hba1c": (4.0, 5.6, "4.0–5.6 %"),
    "serum creatinine": (0.6, 1.3, "0.6–1.3 mg/dL"),
    "creatinine": (0.6, 1.3, "0.6–1.3 mg/dL"),
    "esr": (0.0, 20.0, "0–20 mm/hr"),
    "crp": (0.0, 5.0, "< 5.0 mg/L"),
    "total bilirubin": (0.2, 1.2, "0.2–1.2 mg/dL"),
    "alt": (7.0, 56.0, "7–56 U/L"),
    "sgpt": (7.0, 56.0, "7–56 U/L"),
    "ast": (10.0, 40.0, "10–40 U/L"),
    "sgot": (10.0, 40.0, "10–40 U/L"),
    "tsh": (0.4, 4.5, "0.4–4.5 mIU/L"),
    "total cholesterol": (0.0, 200.0, "< 200 mg/dL"),
}

_QUALITATIVE_POSITIVE = re.compile(
    r"\b(positive|reactive|detected|present|elevated|abnormal|high|borderline|\+{1,4})\b|পজিটিভ",
    re.I,
)
_QUALITATIVE_NEGATIVE = re.compile(
    r"\b(non[\s-]?reactive|not\s+detected|negative|absent|nil|normal|unremarkable|clear|within\s+normal)\b|নেগেটিভ|স্বাভাবিক",
    re.I,
)
_RANGE_BETWEEN = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|to)\s*([0-9]+(?:\.[0-9]+)?)", re.I)
_RANGE_LT = re.compile(r"(?:<|<=|below|less\s+than)\s*([0-9]+(?:\.[0-9]+)?)", re.I)
_RANGE_GT = re.compile(r"(?:>|>=|above|greater\s+than)\s*([0-9]+(?:\.[0-9]+)?)", re.I)

# Patterns covering numeric labs and qualitative positive/negative diagnostic tests.
_REGEX_PATTERNS: List[Tuple[str, str, str]] = [
    (r"(?i)\b(?:hemoglobin|haemoglobin|hb)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(g/dl|gm/dl|g%)?", "Hemoglobin", "g/dL"),
    (r"(?i)\b(?:wbc(?:\s*count)?|white\s*blood\s*cells?|total\s*leukocyte\s*count|tlc)\b\s*[:=\-]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(/cumm|/mm3|/ul|x10\^9/l)?", "WBC Count", "/cumm"),
    (r"(?i)\b(?:platelet(?:\s*count)?|plt)\b\s*[:=\-]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(/cumm|/mm3|/ul|x10\^9/l)?", "Platelet Count", "/cumm"),
    (r"(?i)\b(?:fasting\s*blood\s*(?:sugar|glucose)|fbs)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mmol/l|mg/dl)?", "Fasting Blood Sugar", "mmol/L"),
    (r"(?i)\b(?:random\s*blood\s*(?:sugar|glucose)|rbs|blood\s*sugar|glucose)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mmol/l|mg/dl)?", "Blood Sugar", "mmol/L"),
    (r"(?i)\b(?:hba1c)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(%)?", "HbA1c", "%"),
    (r"(?i)\b(?:serum\s*creatinine|s\.\s*creatinine|creatinine)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mg/dl|umol/l)?", "Serum Creatinine", "mg/dL"),
    (r"(?i)\b(?:esr)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mm/hr|mm/1st\s*hr)?", "ESR", "mm/hr"),
    (r"(?i)\b(?:crp|c-reactive\s*protein)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?|positive|negative|reactive|non-reactive)\s*(mg/l|mg/dl)?", "CRP", "mg/L"),
    (r"(?i)\b(?:total\s*bilirubin|bilirubin)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mg/dl)?", "Total Bilirubin", "mg/dL"),
    (r"(?i)\b(?:alt|sgpt)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(u/l|iu/l)?", "ALT (SGPT)", "U/L"),
    (r"(?i)\b(?:ast|sgot)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(u/l|iu/l)?", "AST (SGOT)", "U/L"),
    (r"(?i)\b(?:tsh)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(miu/l|uiu/ml)?", "TSH", "mIU/L"),
    (r"(?i)\b(?:total\s*cholesterol|cholesterol)\b\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(mg/dl|mmol/l)?", "Total Cholesterol", "mg/dL"),
    (r"(?i)\b(dengue\s*ns1(?:\s*antigen)?|dengue\s*igg|dengue\s*igm)\b\s*[:=\-]?\s*(positive|negative|reactive|non-reactive|detected|not\s*detected)", "", ""),
    (r"(?i)\b(hbsag|anti[\s-]?hcv|hiv(?:\s*1/2)?|vdrl|widal(?:\s*test)?|malaria(?:\s*antigen|\s*mp)?|troponin[\s-]?[it]?|sputum\s*afb|covid[\s-]?19|h\.\s*pylori)\b\s*[:=\-]?\s*(positive|negative|reactive|non-reactive|detected|not\s*detected)", "", ""),
    (r"(?i)\b(urine\s*(?:albumin|protein|sugar|glucose|ketone|pus\s*cells))\b\s*[:=\-]?\s*(positive|negative|nil|trace|absent|present|[0-9]+\-[0-9]+|\+{1,4})", "", ""),
]


def _parse_float(value: str) -> Optional[float]:
    cleaned = str(value or "").replace(",", "").strip()
    m = re.match(r"^-?[0-9]+(?:\.[0-9]+)?$", cleaned)
    if not m:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def infer_interpretation(name: str, value: str, reference_range: str = "") -> Tuple[str, str]:
    """
    Determine a structured draft interpretation (`positive`, `negative`, `high`, `low`,
    `normal`, `abnormal`, or `unknown`) plus a reference range string when known.
    """
    val_str = str(value or "").strip()
    ref_str = str(reference_range or "").strip()

    # Check qualitative negative first so "non-reactive" / "not detected" never matches "reactive" / "detected".
    if _QUALITATIVE_NEGATIVE.search(val_str):
        if re.search(r"\b(normal|unremarkable|clear|within\s+normal)\b|স্বাভাবিক", val_str, re.I):
            return "normal", ref_str
        return "negative", ref_str or "Negative"
    if _QUALITATIVE_POSITIVE.search(val_str):
        if re.search(r"\b(high|elevated)\b", val_str, re.I):
            return "high", ref_str
        if re.search(r"\b(abnormal)\b", val_str, re.I):
            return "abnormal", ref_str
        return "positive", ref_str or "Negative"

    num = _parse_float(val_str)
    if num is None:
        return "unknown", ref_str

    # 1. Explicit reference range on the report takes precedence.
    if ref_str:
        m = _RANGE_BETWEEN.search(ref_str.replace(",", ""))
        if m:
            lo, hi = float(m.group(1)), float(m.group(2))
            if num < lo:
                return "low", ref_str
            if num > hi:
                return "high", ref_str
            return "normal", ref_str
        m_lt = _RANGE_LT.search(ref_str.replace(",", ""))
        if m_lt:
            return ("high" if num > float(m_lt.group(1)) else "normal"), ref_str
        m_gt = _RANGE_GT.search(ref_str.replace(",", ""))
        if m_gt:
            return ("low" if num < float(m_gt.group(1)) else "normal"), ref_str

    # 2. Fallback to standard reference range table by test name.
    key = re.sub(r"\s*\([^)]*\)", "", name or "").strip().lower()
    bounds = _COMMON_NUMERIC_RANGES.get(key)
    if bounds:
        lo, hi, label = bounds
        if num < lo:
            return "low", ref_str or label
        if num > hi:
            return "high", ref_str or label
        return "normal", ref_str or label

    return "unknown", ref_str


def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            try:
                txt = (page.extract_text() or "").strip()
            except Exception:
                txt = ""
            if txt:
                pages.append(f"[Page {idx}]\n{txt}")
        return "\n\n".join(pages).strip()
    except Exception as exc:
        logger.debug("pypdf text extraction skipped: %s", exc)
        return ""


def _extract_tesseract_text(file_bytes: bytes) -> str:
    for lang in ("eng+ben", "eng"):
        try:
            proc = subprocess.run(
                ["tesseract", "stdin", "stdout", "--oem", "1", "-l", lang],
                input=file_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=15,
            )
            if proc.returncode == 0:
                text = proc.stdout.decode("utf-8", errors="ignore").strip()
                if text:
                    return text
        except (FileNotFoundError, subprocess.SubprocessError):
            break
    return ""


def _extract_json_object(raw: str) -> Optional[Dict[str, Any]]:
    """Robustly parse a JSON object from LLM output, tolerating markdown fences or brief surrounding text."""
    if not raw:
        return None
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    try:
        obj = json.loads(cleaned)
        return obj if isinstance(obj, dict) else None
    except ValueError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            obj = json.loads(cleaned[start : end + 1])
            return obj if isinstance(obj, dict) else None
        except ValueError:
            return None
    return None


def _extract_gemini_vision_text(file_bytes: bytes, content_type: str) -> str:
    """When GEMINI_API_KEY is configured, read scanned images or PDFs directly via multimodal Vision."""
    llm_provider = getattr(settings, "LLM_PROVIDER", "mock").lower()
    ocr_provider = getattr(settings, "OCR_PROVIDER", "mock").lower()
    if llm_provider == "mock" and ocr_provider == "mock":
        return ""
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key or not file_bytes:
        return ""
    import requests

    mime = content_type or "image/png"
    b64 = base64.b64encode(file_bytes).decode("ascii")
    prompt = (
        "Transcribe ALL laboratory test names, measured values, units, reference ranges, "
        "lab name, test date, and positive/negative findings from this medical report verbatim as plain text. "
        "List every single test line clearly. Do not diagnose or omit rows."
    )
    candidates = ("gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.1-flash-lite-preview")
    for model in candidates:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime, "data": b64}},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 4096,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        try:
            resp = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": api_key},
                json=payload,
                timeout=35,
            )
            if resp.status_code == 400:
                payload["generationConfig"].pop("thinkingConfig", None)
                resp = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    headers={"x-goog-api-key": api_key},
                    json=payload,
                    timeout=35,
                )
            if resp.status_code != 200:
                logger.info("Gemini vision model %s returned %s", model, resp.status_code)
                continue
            parts = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = "\n".join(str(p.get("text") or "") for p in parts if not p.get("thought")).strip()
            if text:
                return text
        except Exception as exc:
            logger.warning("Gemini vision OCR (%s) failed: %s", model, exc)
    return ""


def extract_raw_text_from_document(file_bytes: bytes, content_type: str = "", filename: str = "") -> Tuple[str, str]:
    """
    Extract readable text from an uploaded PDF or image.
    Returns `(raw_text, engine_used)`.
    """
    if not file_bytes:
        return "", "empty"

    lower_name = (filename or "").lower()
    lower_ct = (content_type or "").lower()
    is_pdf = "pdf" in lower_ct or lower_name.endswith(".pdf") or file_bytes.startswith(b"%PDF")
    is_image = lower_ct.startswith("image/") or lower_name.endswith((".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"))

    if is_pdf:
        pdf_text = _extract_pdf_text(file_bytes)
        if pdf_text:
            return pdf_text, "pypdf"
        vision_text = _extract_gemini_vision_text(file_bytes, "application/pdf")
        if vision_text:
            return vision_text, "gemini-vision"

    if is_image:
        tess_text = _extract_tesseract_text(file_bytes)
        if tess_text:
            return tess_text, "tesseract"
        vision_text = _extract_gemini_vision_text(file_bytes, lower_ct or "image/png")
        if vision_text:
            return vision_text, "gemini-vision"

    # Plain UTF-8 text payloads (useful for tests & exported text reports)
    if not is_image and not file_bytes.startswith(b"%PDF"):
        try:
            decoded = file_bytes.decode("utf-8")
            printable = sum(1 for ch in decoded if ch.isprintable() or ch in "\r\n\t")
            if decoded.strip() and printable / max(len(decoded), 1) > 0.85:
                return decoded.strip(), "text"
        except UnicodeDecodeError:
            pass

    return "", "adapter"


def _parse_fields_with_regex(raw_text: str) -> List[Dict[str, Any]]:
    if not raw_text:
        return []
    found: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for pattern, fixed_name, default_unit in _REGEX_PATTERNS:
        for match in re.finditer(pattern, raw_text):
            if fixed_name:
                name = fixed_name
                val = match.group(1).strip()
                unit = (match.group(2).strip() if len(match.groups()) >= 2 and match.group(2) else default_unit)
            else:
                name = re.sub(r"\s+", " ", match.group(1).strip())
                val = match.group(2).strip()
                unit = ""
            key = name.lower()
            if key in seen or not val:
                continue
            seen.add(key)
            interp, ref_range = infer_interpretation(name, val)
            found.append({
                "name": name,
                "value": val,
                "unit": unit,
                "reference_range": ref_range,
                "interpretation": interp,
                "confidence": 0.9,
                "page": 1,
                "bbox": {},
                "lab": "",
            })
    return found


def _parse_fields_with_llm(raw_text: str) -> List[Dict[str, Any]]:
    """Use the configured LLM (Cerebras/Gemini) to structure arbitrary OCR text into lab fields."""
    if not raw_text or len(raw_text.strip()) < 15:
        return []
    system = (
        "You extract laboratory test results and clinical findings verbatim from OCR text of a medical report. "
        "Return ONLY valid JSON: {\"lab\": str, \"fields\": [{\"name\": str, \"value\": str, \"unit\": str, "
        "\"reference_range\": str, \"interpretation\": \"normal\"|\"abnormal\"|\"positive\"|\"negative\"|\"high\"|\"low\"|\"unknown\", \"page\": int}]}. "
        "Never invent values or tests that are not in the OCR text. Never diagnose."
    )
    raw = generate_text(
        [{"role": "user", "text": raw_text[:6000]}],
        system=system,
        max_tokens=1200,
        temperature=0,
        timeout=30,
        purpose="ocr_extract",
    )
    if not raw:
        return []
    parsed = _extract_json_object(raw)
    if not parsed:
        return []
    items = parsed.get("fields", [])
    default_lab = str(parsed.get("lab") or "").strip()

    out: List[Dict[str, Any]] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        value = str(item.get("value") or "").strip()
        if not name or not value:
            continue
        ref_range = str(item.get("reference_range") or "").strip()
        interp = str(item.get("interpretation") or "unknown").strip().lower()
        inferred_interp, inferred_ref = infer_interpretation(name, value, ref_range)
        if interp not in VALID_INTERPRETATIONS or interp == "unknown":
            interp = inferred_interp
        out.append({
            "name": name[:100],
            "value": value[:255],
            "unit": str(item.get("unit") or "").strip()[:50],
            "reference_range": (ref_range or inferred_ref)[:100],
            "interpretation": interp,
            "confidence": 0.91,
            "page": max(1, int(item.get("page") or 1)),
            "bbox": {},
            "lab": str(item.get("lab") or default_lab).strip()[:255],
        })
    return out


def extract_document_fields_and_text(
    file_bytes: bytes,
    content_type: str,
    filename: str,
    adapter: Any,
) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    End-to-end OCR extraction for PDFs and images.
    Returns `(fields, raw_text, engine_name)`.
    """
    raw_text, engine = extract_raw_text_from_document(file_bytes, content_type, filename)

    fields: List[Dict[str, Any]] = []
    if raw_text:
        fields = _parse_fields_with_llm(raw_text) or _parse_fields_with_regex(raw_text)

    if not fields:
        adapter_fields = adapter.extract(file_bytes)
        engine = getattr(adapter, "name", engine or "mock-ocr")
        for f in adapter_fields:
            name = str(f.get("name") or "Unknown").strip()
            value = str(f.get("value") or "").strip()
            ref_range = str(f.get("reference_range") or "").strip()
            interp = str(f.get("interpretation") or "").strip().lower()
            inferred_interp, inferred_ref = infer_interpretation(name, value, ref_range)
            if interp not in VALID_INTERPRETATIONS or interp == "unknown":
                interp = inferred_interp
            fields.append({
                "name": name,
                "value": value,
                "unit": str(f.get("unit") or "").strip(),
                "reference_range": ref_range or inferred_ref,
                "interpretation": interp,
                "confidence": float(f.get("confidence", 1.0)),
                "page": int(f.get("page", 1)),
                "bbox": f.get("bbox") or {},
                "lab": str(f.get("lab") or "").strip(),
            })

    return fields, raw_text, engine


def _safe_lines(lines: List[str]) -> List[str]:
    return [line for line in lines if line and validate_assistant_output(line, language="en")[1] != "declined"]


def _format_finding(field: Dict[str, Any]) -> Dict[str, Any]:
    val = str(field.get("value") or "").strip()
    unit = str(field.get("unit") or "").strip()
    return {
        "test": str(field.get("name") or "").strip(),
        "value": f"{val} {unit}".strip(),
        "status": str(field.get("interpretation") or "unknown").lower(),
        "reference_range": str(field.get("reference_range") or "").strip(),
        "lab": str(field.get("lab") or "").strip(),
    }


def _deterministic_report_summary(
    filename: str,
    tests: List[str],
    positives: List[Dict[str, Any]],
    negatives: List[Dict[str, Any]],
    rag_refs: List[Dict[str, Any]],
) -> str:
    parts = [f"Extracted {len(tests)} test result(s) from {filename}."]
    if positives:
        pos_str = "; ".join(f"{p['test']}: {p['value']} ({p['status']})" for p in positives[:6])
        parts.append(f"Positive / abnormal findings: {pos_str}.")
    else:
        parts.append("No positive or out-of-range findings flagged among extracted values.")
    if negatives:
        neg_str = "; ".join(f"{n['test']}: {n['value']} ({n['status']})" for n in negatives[:6])
        parts.append(f"Negative / normal findings: {neg_str}.")
    if rag_refs:
        cites = ", ".join(f"{r['document']} (p. {r['page']})" for r in rag_refs)
        parts.append(f"Relevant approved medical references matched: {cites}.")
    return " ".join(parts)


def generate_document_ai_rag_report(
    doc: Any,
    raw_text: str,
    fields: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Summarize extracted OCR findings using our approved Medical Book RAG pipeline
    (`apps.knowledge.search.search`) + configured LLM, with INV-7 safety guards and
    deterministic offline fallback.
    """
    tests_performed = [str(f.get("name") or "").strip() for f in fields if f.get("name")]
    positives = [_format_finding(f) for f in fields if str(f.get("interpretation") or "").lower() in ABNORMAL_INTERPRETATIONS]
    negatives = [_format_finding(f) for f in fields if str(f.get("interpretation") or "").lower() in NORMAL_INTERPRETATIONS]

    # Build RAG query from abnormal/positive tests first, then all test names & raw snippet.
    query_parts = (
        [f"{p['test']} {p['status']} {p['value']}" for p in positives]
        + tests_performed
        + ([raw_text[:400]] if raw_text else [])
    )
    rag_passages: List[Dict[str, Any]] = []
    if query_parts:
        try:
            rag_passages = search_knowledge(" ".join(query_parts), limit=3)
        except Exception as exc:
            logger.warning("RAG knowledge search skipped: %s", exc)
    rag_references = [
        {
            "document": p["document_name"],
            "page": p["page_number"],
            "relevant_information": p["relevant_information"],
        }
        for p in rag_passages
    ]

    summary_text = ""
    questions: List[str] = []
    missing_info: List[str] = []

    if fields or raw_text:
        payload = {
            "filename": getattr(doc, "original_filename", "report"),
            "extracted_fields": [
                {
                    "name": f.get("name"),
                    "value": f.get("value"),
                    "unit": f.get("unit"),
                    "reference_range": f.get("reference_range"),
                    "interpretation": f.get("interpretation"),
                }
                for f in fields
            ],
            "positive_or_abnormal": positives,
            "negative_or_normal": negatives,
            "approved_medical_references": rag_references,
            "raw_text_excerpt": (raw_text or "")[:1500],
        }
        system = (
            "You are a clinical document summarization assistant for Medi Waypoint. "
            "Summarize ONLY the extracted OCR findings from the uploaded medical report, clearly stating "
            "which tests were performed, which findings are positive/high/low/abnormal, and which are negative/normal. "
            "If approved_medical_references are provided, explain their relevant context and cite [document, page]. "
            "NEVER diagnose a disease, NEVER prescribe medicines or dosages, and NEVER invent values not in the input. "
            "Return ONLY valid JSON: {\"summary\": str, \"questions_for_doctor\": [str], \"missing_information\": [str]}."
        )
        raw = generate_text(
            [{"role": "user", "text": json.dumps(payload, ensure_ascii=False)}],
            system=system,
            max_tokens=700,
            temperature=0,
            timeout=30,
            purpose="report_rag_summary",
        )
        if raw:
            parsed = _extract_json_object(raw)
            if parsed:
                candidate_summary = str(parsed.get("summary") or "").strip()
                if candidate_summary and validate_assistant_output(candidate_summary, language="en")[1] != "declined":
                    summary_text = candidate_summary
                questions = _safe_lines([str(x).strip() for x in (parsed.get("questions_for_doctor") or []) if str(x).strip()])[:4]
                missing_info = [str(x).strip() for x in (parsed.get("missing_information") or []) if str(x).strip()][:4]

    if not summary_text:
        summary_text = _deterministic_report_summary(
            getattr(doc, "original_filename", "report"),
            tests_performed,
            positives,
            negatives,
            rag_references,
        )

    if not questions and positives:
        questions = [
            f"Ask your doctor to review the {p['test']} result ({p['value']}, marked {p['status']})."
            for p in positives[:3]
        ]

    is_verified = getattr(doc, "state", "") == "VERIFIED"
    return {
        "summary": summary_text,
        "tests_performed": tests_performed,
        "positive_or_abnormal_findings": positives,
        "negative_or_normal_findings": negatives,
        "rag_references": rag_references,
        "questions_for_doctor": questions,
        "missing_information": missing_info,
        "requires_clinician_review": not is_verified,
        "verified": is_verified,
        "disclaimer": REPORT_DISCLAIMER,
    }


def build_patient_report_history(patient: Any, include_unverified: bool = True) -> Dict[str, Any]:
    """
    Build a concise, grounded report history summary across all analyzed medical reports
    uploaded under `patient` (by patient or clinician) for clinical review and senior-doctor referrals.
    Separates positive/abnormal vs negative/normal findings and marks verified vs draft status (INV-7).
    """
    from apps.documents.models import Document

    allowed_states = ["VERIFIED", "EXTRACTED_UNVERIFIED"] if include_unverified else ["VERIFIED"]
    docs = list(
        Document.objects.filter(patient=patient, state__in=allowed_states)
        .prefetch_related("extraction_jobs__fields")
        .order_by("-created_at")[:15]
    )

    doc_entries: List[Dict[str, Any]] = []
    tests_performed: List[Dict[str, Any]] = []
    positive_or_abnormal: List[Dict[str, Any]] = []
    negative_or_normal: List[Dict[str, Any]] = []

    rag_references: List[Dict[str, Any]] = []
    seen_rag: set[Tuple[str, Any]] = set()
    for doc in docs:
        is_verified = doc.state == "VERIFIED"
        job = doc.extraction_jobs.order_by("-created_at").first()
        job_fields = list(job.fields.exclude(status="rejected").order_by("id")) if job else []
        ai_report = (job.ai_report if job and isinstance(job.ai_report, dict) else {}) or {}

        for ref in ai_report.get("rag_references") or []:
            if isinstance(ref, dict) and ref.get("document"):
                key = (str(ref["document"]), ref.get("page"))
                if key not in seen_rag:
                    seen_rag.add(key)
                    rag_references.append(ref)

        doc_entries.append({
            "id": str(doc.public_id),
            "filename": doc.original_filename,
            "state": doc.state,
            "verified": is_verified,
            "uploaded_at": doc.created_at.isoformat() if doc.created_at else None,
            "summary": str(ai_report.get("summary") or ""),
            "fields_count": len(job_fields),
        })

        for f in job_fields:
            interp = (f.interpretation or "").lower()
            if not interp or interp == "unknown":
                interp, _ = infer_interpretation(f.name, f.value, f.reference_range)
            item = {
                "name": f.name,
                "value": f.value,
                "unit": f.unit,
                "reference_range": f.reference_range,
                "interpretation": interp,
                "lab": f.lab,
                "date": (
                    f.observed_date.isoformat()
                    if f.observed_date
                    else (doc.created_at.isoformat() if doc.created_at else None)
                ),
                "document_id": str(doc.public_id),
                "filename": doc.original_filename,
                "page": f.page,
                "verified": is_verified or f.status in ("accepted", "corrected"),
            }
            tests_performed.append(item)
            if interp in ABNORMAL_INTERPRETATIONS:
                positive_or_abnormal.append(item)
            elif interp in NORMAL_INTERPRETATIONS:
                negative_or_normal.append(item)

    verified_count = sum(1 for d in doc_entries if d["verified"])
    draft_count = len(doc_entries) - verified_count

    if not doc_entries:
        concise_summary = ""
    else:
        summary_parts = [
            f"History compiled from {len(doc_entries)} analyzed report(s) "
            f"({verified_count} clinician-verified, {draft_count} unverified draft): "
            f"{len(tests_performed)} test result(s) recorded."
        ]
        if positive_or_abnormal:
            pos_list = "; ".join(
                f"{x['name']}: {x['value']}{(' ' + x['unit']) if x['unit'] else ''} ({x['interpretation']})"
                for x in positive_or_abnormal[:8]
            )
            summary_parts.append(f"Positive / abnormal: {pos_list}.")
        else:
            summary_parts.append("Positive / abnormal: none detected in analyzed reports.")
        if negative_or_normal:
            neg_list = "; ".join(
                f"{x['name']}: {x['value']}{(' ' + x['unit']) if x['unit'] else ''} ({x['interpretation']})"
                for x in negative_or_normal[:8]
            )
            summary_parts.append(f"Negative / normal: {neg_list}.")
        concise_summary = " ".join(summary_parts)

        # Polish a concise doctor-oriented clinical handoff summary with the LLM when configured (INV-7 safe).
        llm_payload = {
            "reports_count": len(doc_entries),
            "verified_reports_count": verified_count,
            "positive_or_abnormal": [
                {"test": x["name"], "value": f"{x['value']} {x['unit']}".strip(), "status": x["interpretation"], "report": x["filename"]}
                for x in positive_or_abnormal[:15]
            ],
            "negative_or_normal": [
                {"test": x["name"], "value": f"{x['value']} {x['unit']}".strip(), "status": x["interpretation"], "report": x["filename"]}
                for x in negative_or_normal[:15]
            ],
            "rag_references": rag_references[:4],
        }
        llm_raw = generate_text(
            [{"role": "user", "text": json.dumps(llm_payload, ensure_ascii=False)}],
            system=(
                "You write a short, scannable clinical report history summary for a treating or senior receiving doctor. "
                "State ONLY facts present in the input: which tests were performed, which findings were positive/high/low/abnormal, "
                "and which were negative/normal. Keep it to 2-4 crisp sentences. NEVER diagnose or prescribe medications. "
                "Return ONLY JSON: {\"concise_summary\": str}."
            ),
            max_tokens=320,
            temperature=0,
            timeout=20,
            purpose="patient_report_history",
        )
        llm_parsed = _extract_json_object(llm_raw or "")
        if llm_parsed:
            cand = str(llm_parsed.get("concise_summary") or "").strip()
            if cand and validate_assistant_output(cand, language="en")[1] != "declined":
                concise_summary = cand

    return {
        "reports_count": len(doc_entries),
        "verified_reports_count": verified_count,
        "concise_summary": concise_summary,
        "positive_or_abnormal": positive_or_abnormal,
        "negative_or_normal": negative_or_normal,
        "tests_performed": tests_performed,
        "rag_references": rag_references,
        "documents": doc_entries,
        "disclaimer": REPORT_DISCLAIMER,
    }


def refresh_patient_report_history(patient: Any) -> Dict[str, Any]:
    """Compute and persist the patient's longitudinal report summary in the database under their profile."""
    from apps.documents.models import PatientReportHistory

    data = build_patient_report_history(patient, include_unverified=True)
    record, _ = PatientReportHistory.objects.update_or_create(
        patient=patient,
        defaults={
            "reports_count": data["reports_count"],
            "verified_reports_count": data["verified_reports_count"],
            "concise_summary": data["concise_summary"],
            "positive_or_abnormal": data["positive_or_abnormal"],
            "negative_or_normal": data["negative_or_normal"],
            "tests_performed": data["tests_performed"],
            "rag_references": data["rag_references"],
            "documents": data["documents"],
            "disclaimer": data["disclaimer"],
        },
    )
    return record.to_dict()


def get_or_build_patient_report_history(patient: Any) -> Dict[str, Any]:
    """Return the persisted PatientReportHistory from DB, building & saving it if not yet stored."""
    from apps.documents.models import Document, PatientReportHistory

    existing = PatientReportHistory.objects.filter(patient=patient).first()
    live_count = Document.objects.filter(patient=patient, state__in=("VERIFIED", "EXTRACTED_UNVERIFIED")).count()
    if existing and existing.reports_count == live_count:
        return existing.to_dict()
    return refresh_patient_report_history(patient)
