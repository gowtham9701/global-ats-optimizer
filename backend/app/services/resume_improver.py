"""Apply concrete, ATS-boosting modifications to a resume.

Used by the conversational copilot's "improve / rewrite / optimize" actions.
Works deterministically (strengthen weak verbs, quantify prompts, inject
missing keywords into a Skills section) and, when a live LLM is present,
produces a fluent full rewrite grounded by RAG. Always returns an updated
:class:`ParsedResume` plus a human-readable change log.
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

from app.agents.tools import ACTION_VERB_MAP
from app.models.schemas import ParsedResume, ResumeSection
from app.services.ats_scorer import WEAK_PHRASES, keyword_match
from app.services.llm_provider import get_llm
from app.services.rag import get_knowledge_base


def _strengthen_line(line: str) -> Tuple[str, bool]:
    changed = False
    out = line
    lowered = out.lower()
    for weak, strong in ACTION_VERB_MAP.items():
        if re.search(r"\b" + re.escape(weak) + r"\b", lowered):
            out = re.sub(r"\b" + re.escape(weak) + r"\b", strong, out, count=1, flags=re.I)
            changed = True
            lowered = out.lower()
    # Prompt to quantify if there is no number anywhere in the bullet.
    if changed and not re.search(r"\d", out) and "quantify" not in lowered:
        out = out.rstrip(". ") + " — quantify the impact (e.g. by 30%)."
    return out, changed


def _deterministic_improve(parsed: ParsedResume, job_description: str,
                           country: str) -> Tuple[ParsedResume, List[str]]:
    changes: List[str] = []
    new_sections: List[ResumeSection] = []
    strengthened = 0

    for section in parsed.sections:
        new_lines: List[str] = []
        for line in section.lines:
            improved, changed = _strengthen_line(line)
            if changed:
                strengthened += 1
            new_lines.append(improved)
        new_sections.append(ResumeSection(title=section.title, lines=new_lines))

    if strengthened:
        changes.append(f"Strengthened {strengthened} bullet(s) with impact verbs and metric prompts.")

    # Inject missing JD keywords into (or create) a Skills section.
    if job_description.strip():
        text = "\n".join(l for s in new_sections for l in s.lines)
        _, missing, _ = keyword_match(text, job_description)
        meaningful = [m for m in missing if len(m) > 2][:10]
        if meaningful:
            skills_section = next(
                (s for s in new_sections if s.title.lower().startswith("skill")), None
            )
            if skills_section is None:
                skills_section = ResumeSection(title="Skills", lines=[])
                new_sections.append(skills_section)
            existing = " ".join(skills_section.lines).lower()
            to_add = [m for m in meaningful if m.lower() not in existing]
            if to_add:
                addition = ", ".join(t.title() if t.islower() else t for t in to_add)
                if skills_section.lines:
                    skills_section.lines[0] = (skills_section.lines[0].rstrip(". ") + ", " + addition)
                else:
                    skills_section.lines.append(addition)
                changes.append(f"Added {len(to_add)} missing keyword(s) to Skills: {addition}.")

    if not changes:
        changes.append("Resume already uses strong phrasing — no automatic rewrites were needed.")

    improved_parsed = _rebuild(parsed, new_sections)
    return improved_parsed, changes


def _rebuild(parsed: ParsedResume, sections: List[ResumeSection]) -> ParsedResume:
    lines: List[str] = []
    c = parsed.contact
    if c.name:
        lines.append(c.name)
    header = " | ".join([p for p in [c.email, c.phone, c.location] if p] + (c.links or []))
    if header:
        lines.append(header)
    lines.append("")
    kept_sections: List[ResumeSection] = []
    for s in sections:
        # The parser emits a synthetic "Header" section holding the contact
        # block; drop it so the name/contact is not duplicated in the body.
        if s.title.strip().lower() == "header":
            continue
        kept_sections.append(s)
        lines.append(s.title.upper())
        for ln in s.lines:
            lines.append(ln if ln.startswith("-") else f"- {ln}")
        lines.append("")
    raw = "\n".join(lines).strip()
    return ParsedResume(
        raw_text=raw, contact=parsed.contact, sections=kept_sections,
        word_count=len(re.findall(r"\b\w+\b", raw)),
    )


def _llm_improve(parsed: ParsedResume, job_description: str,
                 country: str, instruction: str) -> ParsedResume | None:
    llm = get_llm()
    if not llm.is_live:
        return None
    kb = get_knowledge_base()
    context = kb.retrieve(f"{country} resume ATS impact metrics keywords", country=country, k=4)
    context_block = "\n".join(f"- {c}" for c in context)
    schema = (
        '{"contact":{"name":"","email":"","phone":"","location":"","links":[]},'
        '"sections":[{"title":"","lines":["..."]}]}'
    )
    current = "\n".join(
        [parsed.contact.name or ""]
        + [f"## {s.title}\n" + "\n".join(f"- {l}" for l in s.lines) for s in parsed.sections]
    )
    prompt = (
        "Improve this resume for ATS and recruiter impact. "
        f"User instruction: {instruction or 'optimize overall'}.\n"
        f"Target country: {country}.\n"
        + (f"Job description to align with:\n{job_description}\n\n" if job_description.strip() else "")
        + "Rules: keep it truthful, use 'Action verb + task + quantified result', "
        "integrate relevant keywords naturally, single-column ATS-safe.\n\n"
        f"Knowledge:\n{context_block}\n\nCurrent resume:\n{current}\n\n"
        f"Return ONLY JSON in this shape: {schema}"
    )
    data = llm.generate_json(prompt, system="You are an expert resume optimizer.")
    if not data or "sections" not in data:
        return None
    try:
        from app.models.schemas import ContactInfo
        contact = ContactInfo(**(data.get("contact") or parsed.contact.model_dump()))
        sections = [
            ResumeSection(title=str(s.get("title", "Section")),
                          lines=[str(l) for l in (s.get("lines") or []) if str(l).strip()])
            for s in data["sections"]
        ]
        return _rebuild(ParsedResume(raw_text="", contact=contact, sections=sections), sections)
    except Exception:
        return None


def improve_resume(parsed: ParsedResume, job_description: str = "",
                   country: str = "global", instruction: str = "") -> Tuple[ParsedResume, List[str], str]:
    """Return (improved_parsed, change_log, source)."""
    llm_result = _llm_improve(parsed, job_description, country, instruction)
    if llm_result is not None:
        return llm_result, ["Rewrote the resume with the AI model for stronger impact and keyword alignment."], "llm"
    improved, changes = _deterministic_improve(parsed, job_description, country)
    return improved, changes, "heuristic"
