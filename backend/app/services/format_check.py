"""Country-specific resume *format* verification.

Given any resume (generated **or uploaded**) and a target country, this checks
how well the document matches that country's ATS/hiring format conventions and
returns a per-rule pass/warn/fail breakdown plus an overall compliance score.

This is deliberately deterministic (no model needed) so the "Verify format for
<country>" control works instantly and for free, on uploaded resumes too.
"""
from __future__ import annotations

import re
from typing import Dict, List

from app.models.schemas import FormatCheckResult, FormatRule
from app.services.localization import COUNTRY_SECTION_ORDER

# Fields that Western / anonymised standards expect to be ABSENT, but that are
# common/acceptable on an Indian-style resume.
PRIVACY_PATTERNS: Dict[str, re.Pattern] = {
    "Date of birth": re.compile(r"(?i)\b(date of birth|d\.?o\.?b\.?|born on)\b"),
    "Marital status": re.compile(r"(?i)\b(marital status|married|unmarried)\b"),
    "Nationality / religion / gender": re.compile(r"(?i)\b(nationality|religion|caste|gender|sex)\b\s*:?"),
    "Father's / spouse's name": re.compile(r"(?i)\b(father'?s? name|mother'?s? name|spouse'?s? name)\b"),
    "Passport / visa": re.compile(r"(?i)\b(passport (no|number)|visa status)\b"),
    "Photo": re.compile(r"(?i)\b(photo|photograph|profile picture)\b"),
    "Declaration": re.compile(r"(?i)^\s*declaration\b"),
}

# Countries where the above fields should be stripped for equal-opportunity law.
ANONYMISED_COUNTRIES = {"usa", "uk", "canada", "germany", "global"}

MMYYYY_RE = re.compile(r"\b(0[1-9]|1[0-2])[/.\-](19|20)\d{2}\b")
YEAR_RANGE_RE = re.compile(r"\b(19|20)\d{2}\s*[-–to]+\s*((19|20)\d{2}|present|current)\b", re.I)
BULLET_RE = re.compile(r"^\s*[-•*▪◦‣>]\s*")


def _has_section(text_lower: str, names: List[str]) -> bool:
    return any(n.lower() in text_lower for n in names)


# Synonyms so section detection is robust across wordings.
SECTION_SYNONYMS: Dict[str, List[str]] = {
    "Personal Details": ["personal details", "contact", "personal information"],
    "Professional Experience": ["experience", "berufserfahrung", "employment", "work history"],
    "Experience": ["experience", "employment", "work history"],
    "Education": ["education", "ausbildung", "academic"],
    "Skills": ["skills", "kenntnisse", "technical skills", "competencies"],
    "Languages": ["languages", "sprachen"],
    "Interests": ["interests", "hobbies"],
    "Professional Summary": ["summary", "professional summary", "profile", "objective"],
    "Personal Profile": ["profile", "personal profile", "summary"],
    "Summary": ["summary", "profile", "objective"],
    "Certifications": ["certification", "certificate", "licences", "licenses"],
    "References": ["references", "referees"],
    "Projects": ["projects", "portfolio"],
}


def check_format(resume_text: str, target_country: str) -> FormatCheckResult:
    country = (target_country or "global").lower()
    text_lower = resume_text.lower()
    lines = [l for l in resume_text.splitlines() if l.strip()]
    rules: List[FormatRule] = []

    expected_sections = COUNTRY_SECTION_ORDER.get(country, COUNTRY_SECTION_ORDER["global"])

    # 1) Expected sections present.
    missing: List[str] = []
    for sec in expected_sections:
        syn = SECTION_SYNONYMS.get(sec, [sec])
        if not _has_section(text_lower, syn):
            missing.append(sec)
    if not missing:
        rules.append(FormatRule(
            label="Section coverage",
            status="pass",
            detail=f"All expected {country.title()} sections are present: {', '.join(expected_sections)}.",
        ))
    else:
        rules.append(FormatRule(
            label="Section coverage",
            status="warn" if len(missing) < len(expected_sections) else "fail",
            detail=f"Missing recommended section(s) for {country.title()}: {', '.join(missing)}.",
        ))

    # 2) Privacy / anonymisation.
    found_private = [name for name, pat in PRIVACY_PATTERNS.items() if pat.search(resume_text)]
    if country in ANONYMISED_COUNTRIES:
        if found_private:
            rules.append(FormatRule(
                label="Privacy & anti-discrimination",
                status="fail",
                detail=f"{country.title()} resumes should omit: {', '.join(found_private)}. "
                       "Remove these for equal-opportunity compliance.",
            ))
        else:
            rules.append(FormatRule(
                label="Privacy & anti-discrimination",
                status="pass",
                detail="No photo, date of birth, marital status or similar personal fields detected. Good.",
            ))
    else:
        # India: including these is conventional, so this is informational.
        rules.append(FormatRule(
            label="Privacy & anti-discrimination",
            status="pass",
            detail="Personal details are acceptable for this country's conventions.",
        ))

    # 3) Date formatting.
    has_mmyyyy = bool(MMYYYY_RE.search(resume_text))
    has_year_range = bool(YEAR_RANGE_RE.search(resume_text))
    if country == "germany":
        if has_mmyyyy:
            rules.append(FormatRule(label="Date format", status="pass",
                                    detail="Precise MM/YYYY dates detected, as German employers expect."))
        else:
            rules.append(FormatRule(label="Date format", status="warn",
                                    detail="German CVs expect precise MM/YYYY dates for every entry (e.g. 06/2024)."))
    else:
        if has_year_range or has_mmyyyy:
            rules.append(FormatRule(label="Date format", status="pass",
                                    detail="Dated, reverse-chronological entries detected."))
        else:
            rules.append(FormatRule(label="Date format", status="warn",
                                    detail="Add clear start–end dates (e.g. 2021–Present) to each role."))

    # 4) ATS-safe single-column layout.
    tabby = sum(1 for l in lines if "\t" in l or re.search(r"\s{4,}\S+\s{4,}", l))
    if lines and tabby > len(lines) * 0.2:
        rules.append(FormatRule(label="ATS-safe layout", status="fail",
                                detail="Multi-column/table layout detected — many ATS cannot parse columns. Use a single column."))
    else:
        rules.append(FormatRule(label="ATS-safe layout", status="pass",
                                detail="Single-column, parser-friendly layout."))

    # 5) Bullet usage.
    bullets = sum(1 for l in lines if BULLET_RE.match(l))
    if bullets >= 3:
        rules.append(FormatRule(label="Bullet points", status="pass",
                                detail=f"{bullets} achievement bullets found."))
    else:
        rules.append(FormatRule(label="Bullet points", status="warn",
                                detail="Use concise achievement bullets rather than dense paragraphs."))

    # Overall compliance score from rule outcomes.
    weight = {"pass": 1.0, "warn": 0.5, "fail": 0.0}
    score = int(round(sum(weight[r.status] for r in rules) / len(rules) * 100)) if rules else 0

    order_note = f"Recommended {country.title()} section order: {' → '.join(expected_sections)}."
    return FormatCheckResult(
        target_country=country,
        compliance_score=score,
        rules=rules,
        section_order=expected_sections,
        note=order_note,
    )
