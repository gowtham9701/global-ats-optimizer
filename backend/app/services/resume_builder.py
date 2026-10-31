"""Generate a structured resume from a free-text prompt / description.

When a live LLM (Gemini / Ollama) is available it produces a rich, ATS-aware
resume as structured JSON grounded by RAG country guidance. Without any model
it falls back to a deterministic builder that organises the user's description
into a clean, ATS-friendly section layout — so resume creation always works.
"""
from __future__ import annotations

import json
import re
from typing import Dict, List

from app.models.schemas import ContactInfo, GenerateResumeResult, ParsedResume, ResumeSection
from app.services.llm_provider import get_llm
from app.services.parser import parse_resume
from app.services.rag import get_knowledge_base

IMPACT_VERBS = [
    "Led", "Built", "Designed", "Delivered", "Improved", "Reduced", "Automated",
    "Launched", "Scaled", "Optimized", "Developed", "Implemented",
]


def _contact_block(full_name: str, email: str, phone: str) -> str:
    parts = [p for p in [full_name, email, phone] if p]
    return " | ".join(parts)


def _llm_generate(req_description: str, country: str, full_name: str,
                  email: str, phone: str) -> ParsedResume | None:
    llm = get_llm()
    if not llm.is_live:
        return None
    kb = get_knowledge_base()
    context = kb.retrieve(f"{country} resume ATS structure impact metrics", country=country, k=4)
    context_block = "\n".join(f"- {c}" for c in context)
    schema = (
        '{"contact":{"name":"","email":"","phone":"","location":"","links":[]},'
        '"sections":[{"title":"Summary","lines":["..."]},'
        '{"title":"Experience","lines":["..."]},'
        '{"title":"Skills","lines":["..."]},'
        '{"title":"Education","lines":["..."]}]}'
    )
    prompt = (
        "Create a professional, ATS-optimized resume as STRICT JSON only.\n"
        f"Candidate name: {full_name or 'use a suitable placeholder'}.\n"
        f"Email: {email}. Phone: {phone}.\n"
        f"Target country conventions: {country}.\n"
        "Rules: every experience bullet must use 'Action verb + task + quantified result'. "
        "Use strong impact verbs and realistic metrics. Keep it truthful to the description; "
        "do not fabricate employers that are not implied. Single-column, ATS-friendly.\n\n"
        f"ATS knowledge to follow:\n{context_block}\n\n"
        f"User description of their background/goal:\n{req_description}\n\n"
        f"Return ONLY JSON in exactly this shape: {schema}"
    )
    data = llm.generate_json(prompt, system="You are an expert resume writer and ATS specialist.")
    if not data or "sections" not in data:
        return None
    try:
        contact = ContactInfo(**(data.get("contact") or {}))
        if full_name:
            contact.name = full_name
        if email:
            contact.email = email
        if phone:
            contact.phone = phone
        sections = [
            ResumeSection(title=str(s.get("title", "Section")),
                          lines=[str(l) for l in (s.get("lines") or []) if str(l).strip()])
            for s in data["sections"]
        ]
        raw = _render_text(contact, sections)
        return ParsedResume(raw_text=raw, contact=contact, sections=sections,
                            word_count=len(re.findall(r"\b\w+\b", raw)))
    except Exception:
        return None


def _heuristic_generate(description: str, full_name: str, email: str, phone: str) -> ParsedResume:
    """Structure the user's description into a clean ATS layout without a model."""
    desc = description.strip()
    sentences = [s.strip() for s in re.split(r"[.\n]+", desc) if s.strip()]

    # Identify skills sentences by their label so they are not duplicated as
    # experience bullets, and strip the leading label (e.g. "Skills:").
    skill_prefix = re.compile(r"^(skills?|skill set|technologies|tech stack|tools|proficient in)\s*:?\s*", re.I)
    skill_sentences = {i for i, s in enumerate(sentences) if skill_prefix.match(s)}

    skill_tokens: List[str] = []
    for i, s in enumerate(sentences):
        body = skill_prefix.sub("", s) if i in skill_sentences else s
        if "," in body and len(body) < 160:
            skill_tokens.extend([t.strip() for t in body.split(",") if 1 < len(t.strip()) < 30])
    skills = sorted(set(skill_tokens))[:16]

    # Build a summary from the first 1-2 sentences.
    summary = ". ".join(sentences[:2])
    if summary and not summary.endswith("."):
        summary += "."

    # Turn remaining sentences into achievement bullets with impact verbs.
    past_verbs = {v.lower() for v in IMPACT_VERBS} | {
        "led", "built", "designed", "delivered", "improved", "reduced", "automated",
        "launched", "scaled", "optimized", "developed", "implemented", "created",
        "managed", "migrated", "mentored", "architected", "drove", "shipped",
    }
    goal_starts = ("i want", "i am looking", "i would like", "i am seeking", "seeking", "looking for")

    def _clean(sentence: str) -> str:
        # Strip leading first-person framing so bullets read as achievements.
        cleaned = re.sub(r"^(i have|i've|i had|i am|i'm|i|we have|we|my|using)\s+", "",
                         sentence, flags=re.I).strip()
        return cleaned

    bullets: List[str] = []
    for i, s in enumerate(sentences[2:14]):
        if (i + 2) in skill_sentences:
            continue  # skills lines belong in the Skills section only
        if s.lower().startswith(goal_starts):
            continue  # skip objective/goal statements
        cleaned = _clean(s)
        if not cleaned:
            continue
        first = cleaned.split()[0].lower().rstrip(",.")
        if first in past_verbs:
            bullet = cleaned[0].upper() + cleaned[1:]
        else:
            verb = IMPACT_VERBS[i % len(IMPACT_VERBS)]
            bullet = f"{verb} {cleaned[0].lower() + cleaned[1:]}"
        if not re.search(r"\d", bullet):
            bullet += " (quantify impact, e.g. by 25%)"
        bullets.append(bullet)
    if not bullets:
        bullets = ["Delivered measurable results across key projects (add quantified metrics)."]

    contact = ContactInfo(name=full_name or "Your Name", email=email or None, phone=phone or None)
    sections = [
        ResumeSection(title="Summary", lines=[summary or "Results-driven professional."]),
        ResumeSection(title="Experience", lines=bullets),
    ]
    if skills:
        sections.append(ResumeSection(title="Skills", lines=[", ".join(skills)]))
    sections.append(ResumeSection(title="Education", lines=["Add your degree, institution and year."]))

    raw = _render_text(contact, sections)
    return ParsedResume(raw_text=raw, contact=contact, sections=sections,
                        word_count=len(re.findall(r"\b\w+\b", raw)))


def _render_text(contact: ContactInfo, sections: List[ResumeSection]) -> str:
    lines: List[str] = []
    if contact.name:
        lines.append(contact.name)
    header = _contact_block("", contact.email or "", contact.phone or "")
    if contact.links:
        header = " | ".join([p for p in [header] + contact.links if p])
    if header:
        lines.append(header)
    lines.append("")
    for s in sections:
        lines.append(s.title.upper())
        for ln in s.lines:
            lines.append(f"- {ln}" if not ln.startswith("-") else ln)
        lines.append("")
    return "\n".join(lines).strip()


def generate_resume(description: str, target_country: str = "global",
                    full_name: str = "", email: str = "", phone: str = "") -> GenerateResumeResult:
    country = (target_country or "global").lower()
    parsed = _llm_generate(description, country, full_name, email, phone)
    source = "llm"
    if parsed is None:
        parsed = _heuristic_generate(description, full_name, email, phone)
        source = "heuristic"
    return GenerateResumeResult(parsed=parsed, resume_text=parsed.raw_text, source=source)
