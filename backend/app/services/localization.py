"""Multi-country resume localization engine.

Converts a resume between localized conventions (e.g. a dense Indian-style
resume into a clean, anonymised German Lebenslauf). Uses deterministic
transforms for privacy/structure and optionally an LLM pass for fluent
rephrasing, grounded by RAG context.
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

from app.models.schemas import LocalizeResult
from app.services.llm_provider import get_llm
from app.services.rag import get_knowledge_base

# Personal fields that should be stripped for Western / anonymised standards.
SENSITIVE_PATTERNS: Dict[str, re.Pattern] = {
    "date of birth": re.compile(r"(?i)\b(date of birth|d\.?o\.?b\.?|born on|birth\s*date)\b.*"),
    "father's name": re.compile(r"(?i)\b(father'?s? name|mother'?s? name|spouse'?s? name)\b.*"),
    "marital status": re.compile(r"(?i)\b(marital status|married|unmarried|single)\b.*"),
    "nationality": re.compile(r"(?i)\b(nationality|religion|caste|gender|sex)\b\s*:?.*"),
    "declaration": re.compile(r"(?i)^\s*declaration\b.*"),
    "passport": re.compile(r"(?i)\b(passport (no|number)|visa status)\b.*"),
}

COUNTRY_SECTION_ORDER: Dict[str, List[str]] = {
    "germany": ["Personal Details", "Professional Experience", "Education", "Skills", "Languages", "Interests"],
    "usa": ["Professional Summary", "Experience", "Skills", "Education", "Certifications"],
    "uk": ["Personal Profile", "Experience", "Education", "Skills", "References"],
    "canada": ["Summary", "Skills", "Experience", "Education"],
    "global": ["Summary", "Experience", "Education", "Skills", "Projects"],
}


def _strip_sensitive(text: str) -> Tuple[str, List[str]]:
    removed: List[str] = []
    kept_lines: List[str] = []
    for line in text.splitlines():
        hit = None
        for field, pattern in SENSITIVE_PATTERNS.items():
            if pattern.search(line):
                hit = field
                break
        if hit:
            if hit not in removed:
                removed.append(hit)
            continue
        kept_lines.append(line)
    return "\n".join(kept_lines), removed


def _structural_notes(country: str) -> List[str]:
    order = COUNTRY_SECTION_ORDER.get(country, COUNTRY_SECTION_ORDER["global"])
    notes = [f"Recommended section order: {' → '.join(order)}."]
    if country == "germany":
        notes.append("Use reverse-chronological entries with precise MM/YYYY dates.")
        notes.append("Photo, DOB and marital status omitted for AGG-compliant anonymised format.")
    if country in {"usa", "uk", "canada"}:
        notes.append("No photo, age, or marital status (equal-opportunity compliance).")
    return notes


def localize_resume(resume_text: str, target_country: str) -> LocalizeResult:
    country = (target_country or "global").lower()
    cleaned, removed = _strip_sensitive(resume_text)
    notes = _structural_notes(country)

    llm = get_llm()
    converted = cleaned
    if llm.is_live:
        kb = get_knowledge_base()
        context = kb.retrieve(f"{country} resume CV structure standards", country=country, k=4)
        context_block = "\n".join(f"- {c}" for c in context)
        order = COUNTRY_SECTION_ORDER.get(country, COUNTRY_SECTION_ORDER["global"])
        prompt = (
            f"Rewrite the following resume to match {country.title()} hiring conventions.\n"
            f"Follow this section order: {', '.join(order)}.\n"
            f"Keep it factual — do not invent experience. Use concise achievement bullets.\n\n"
            f"Knowledge base guidance:\n{context_block}\n\n"
            f"Resume:\n{cleaned}\n\n"
            f"Return only the rewritten resume as plain text."
        )
        result = llm.generate(prompt, system="You are an expert international CV writer.", temperature=0.3)
        if result:
            converted = result

    return LocalizeResult(
        target_country=country,
        converted_text=converted,
        structural_notes=notes,
        removed_fields=removed,
    )
