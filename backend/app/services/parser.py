"""Resume parsing: extract raw text and a semantic section layout.

Supports PDF (pdfplumber) and DOCX (python-docx) plus plain text. The
parser is intentionally resilient: it never raises on malformed input and
always returns a :class:`ParsedResume`.
"""
from __future__ import annotations

import io
import logging
import re
from typing import List, Tuple

from app.models.schemas import ContactInfo, ParsedResume, ResumeSection

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")
LINK_RE = re.compile(r"(https?://[^\s]+|(?:www\.|linkedin\.com|github\.com)[^\s]+)", re.I)

# Common resume section headers (case-insensitive, allows some variance).
SECTION_HEADERS = [
    "summary", "objective", "profile", "about",
    "experience", "work experience", "professional experience", "employment",
    "education", "academic background",
    "skills", "technical skills", "core competencies",
    "projects", "personal projects",
    "certifications", "certificates", "licenses",
    "achievements", "awards", "honors",
    "publications", "research",
    "languages", "interests", "hobbies",
    "references", "volunteer", "extracurricular",
]


def extract_text(filename: str, data: bytes) -> str:
    """Extract raw text from an uploaded file by extension."""
    name = (filename or "").lower()
    try:
        if name.endswith(".pdf"):
            return _extract_pdf(data)
        if name.endswith(".docx"):
            return _extract_docx(data)
        if name.endswith(".doc"):
            # Legacy .doc is not reliably parseable without external tools.
            return data.decode("utf-8", errors="ignore")
        return data.decode("utf-8", errors="ignore")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Text extraction failed for %s: %s", filename, exc)
        return data.decode("utf-8", errors="ignore")


def _extract_pdf(data: bytes) -> str:
    import pdfplumber

    chunks: List[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def _extract_docx(data: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(data))
    lines = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            lines.append(" ".join(cell.text for cell in row.cells))
    return "\n".join(lines)


def _is_header(line: str) -> bool:
    cleaned = re.sub(r"[^a-zA-Z ]", "", line).strip().lower()
    if not cleaned or len(cleaned) > 40:
        return False
    if cleaned in SECTION_HEADERS:
        return True
    # ALL CAPS short lines are very likely headers.
    words = line.strip().split()
    if 1 <= len(words) <= 4 and line.strip().isupper() and len(line.strip()) > 2:
        return True
    return False


def _extract_contact(text: str) -> ContactInfo:
    emails = EMAIL_RE.findall(text)
    phones = PHONE_RE.findall(text)
    links = LINK_RE.findall(text)
    first_lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:5]
    name = None
    for line in first_lines:
        if EMAIL_RE.search(line) or PHONE_RE.search(line):
            continue
        letters = re.sub(r"[^a-zA-Z ]", "", line).strip()
        if 2 <= len(letters.split()) <= 4 and len(letters) < 40:
            name = letters.title()
            break
    return ContactInfo(
        name=name,
        email=emails[0] if emails else None,
        phone=phones[0].strip() if phones else None,
        links=sorted({l.rstrip(").,") for l in links}),
    )


def _split_sections(text: str) -> List[ResumeSection]:
    sections: List[ResumeSection] = []
    current = ResumeSection(title="Header", lines=[])
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _is_header(line):
            if current.lines:
                sections.append(current)
            current = ResumeSection(title=line.title(), lines=[])
        else:
            current.lines.append(line)
    if current.lines:
        sections.append(current)
    return sections


def parse_resume(text: str) -> ParsedResume:
    """Build a semantic :class:`ParsedResume` from raw text."""
    text = text or ""
    contact = _extract_contact(text)
    sections = _split_sections(text)
    word_count = len(re.findall(r"\b\w+\b", text))
    return ParsedResume(
        raw_text=text,
        contact=contact,
        sections=sections,
        word_count=word_count,
    )


def parse_upload(filename: str, data: bytes) -> ParsedResume:
    return parse_resume(extract_text(filename, data))
