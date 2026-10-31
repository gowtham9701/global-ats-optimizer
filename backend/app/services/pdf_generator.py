"""HTML-to-PDF resume generation.

Renders a :class:`ParsedResume` through a Jinja2 HTML template and compiles
it to PDF. The primary engine is ``xhtml2pdf`` (pisa) which is pure-Python
and therefore deployable on free hosting tiers with no system libraries.
If WeasyPrint is installed it is used for higher-fidelity output.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models.schemas import ParsedResume

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

TEMPLATES = {
    "tech_minimalist": {
        "file": "tech_minimalist.html",
        "name": "Tech Minimalist",
        "description": "Clean single-column layout optimised for engineering roles and ATS parsing.",
    },
    "executive": {
        "file": "executive.html",
        "name": "Executive Professional",
        "description": "Polished, authoritative layout for senior leadership and management roles.",
    },
    "academic": {
        "file": "academic.html",
        "name": "Academic CV",
        "description": "Structured long-form CV for research, publications and academia.",
    },
}

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def list_templates() -> List[dict]:
    return [
        {"id": tid, "name": meta["name"], "description": meta["description"]}
        for tid, meta in TEMPLATES.items()
    ]


def render_html(parsed: ParsedResume, template: str, accent_color: str = "#2563eb") -> str:
    meta = TEMPLATES.get(template, TEMPLATES["tech_minimalist"])
    tpl = _env.get_template(meta["file"])
    # Separate header/contact section from real content sections.
    content_sections = [s for s in parsed.sections if s.title.lower() != "header"]
    return tpl.render(
        contact=parsed.contact,
        sections=content_sections,
        accent_color=accent_color,
    )


def html_to_pdf(html: str) -> bytes:
    """Compile HTML into PDF bytes, preferring WeasyPrint then xhtml2pdf."""
    # Try WeasyPrint (optional, higher fidelity).
    try:
        from weasyprint import HTML  # type: ignore

        return HTML(string=html).write_pdf()
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.debug("WeasyPrint unavailable (%s); using xhtml2pdf.", exc)

    from xhtml2pdf import pisa

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=io.StringIO(html), dest=buffer)
    if result.err:
        raise RuntimeError("PDF generation failed")
    return buffer.getvalue()


def generate_pdf(parsed: ParsedResume, template: str, accent_color: str = "#2563eb") -> bytes:
    html = render_html(parsed, template, accent_color)
    return html_to_pdf(html)
