"""AI job-application tailoring.

Given a pasted job posting and the user's career profile, this:

* extracts the company, role, location and key requirements from the posting,
* scores how well the profile matches (reusing the ATS keyword engine),
* identifies gaps (what the posting asks for that the profile lacks),
* drafts a tailored resume (as structured sections) and a cover letter —
  strictly from facts in the profile, never inventing experience.

When a live LLM is configured it produces rich, grounded output; otherwise a
deterministic fallback keeps the whole flow working for free.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from app.services.ats_scorer import extract_keywords, keyword_match
from app.services.llm_provider import get_llm


def _profile_text(profile: dict) -> str:
    """Flatten a profile dict into plain text for keyword matching / prompts."""
    parts: List[str] = []
    if profile.get("full_name"):
        parts.append(profile["full_name"])
    if profile.get("headline"):
        parts.append(profile["headline"])
    if profile.get("summary"):
        parts.append(profile["summary"])
    for skill in profile.get("skills", []):
        parts.append(str(skill))
    for exp in profile.get("experience", []):
        if isinstance(exp, dict):
            parts.append(" ".join(str(v) for v in exp.values()))
            for b in exp.get("bullets", []) or []:
                parts.append(str(b))
        else:
            parts.append(str(exp))
    for proj in profile.get("projects", []):
        parts.append(" ".join(str(v) for v in proj.values()) if isinstance(proj, dict) else str(proj))
    for edu in profile.get("education", []):
        parts.append(" ".join(str(v) for v in edu.values()) if isinstance(edu, dict) else str(edu))
    return "\n".join(parts)


def _extract_basics_heuristic(posting: str) -> Dict:
    company = ""
    role = ""
    location = ""
    # Common patterns: "Company: X", "Role: Y", "Location: Z".
    for line in posting.splitlines()[:40]:
        low = line.lower()
        if not company and ("company" in low or "employer" in low) and ":" in line:
            company = line.split(":", 1)[1].strip()[:120]
        if not role and ("role" in low or "position" in low or "title" in low) and ":" in line:
            role = line.split(":", 1)[1].strip()[:120]
        if not location and "location" in low and ":" in line:
            location = line.split(":", 1)[1].strip()[:120]
    return {"company": company, "role": role, "location": location}


def _requirements_heuristic(posting: str) -> List[str]:
    reqs: List[str] = []
    for raw in posting.splitlines():
        line = raw.strip()
        if re.match(r"^[-•*▪]\s+", line) and len(line) > 6:
            reqs.append(re.sub(r"^[-•*▪]\s+", "", line)[:160])
    if not reqs:
        reqs = extract_keywords(posting, 12)
    return reqs[:15]


def tailor_application(posting: str, profile: dict) -> Dict:
    """Return extracted details + match + gaps + tailored resume + cover letter."""
    profile_text = _profile_text(profile)
    llm = get_llm()

    data: Optional[dict] = None
    if llm.is_live:
        data = _tailor_llm(posting, profile, profile_text, llm)

    if not data:
        data = _tailor_heuristic(posting, profile, profile_text)

    # Always compute an objective match score from keyword overlap.
    _, missing, ratio = keyword_match(profile_text, posting)
    data["match_score"] = int(round(ratio * 100))
    if not data.get("gaps"):
        data["gaps"] = [m for m in missing if len(m) > 2][:10]
    return data


def _tailor_llm(posting: str, profile: dict, profile_text: str, llm) -> Optional[dict]:
    schema = (
        '{"company":"","role":"","location":"","requirements":["..."],'
        '"gaps":["..."],'
        '"tailored_resume":{"contact":{"name":"","email":"","phone":"","location":"","links":[]},'
        '"sections":[{"title":"Summary","lines":["..."]}]},'
        '"cover_letter":"..."}'
    )
    prompt = (
        "You are an expert career assistant. Read the JOB POSTING and the candidate PROFILE, "
        "then produce STRICT JSON only.\n"
        "Rules:\n"
        "- Extract company, role, location and the key requirements from the posting.\n"
        "- List gaps: requirements the posting asks for that the profile does NOT evidence.\n"
        "- Write a tailored resume (structured sections) and a cover letter that use ONLY facts "
        "present in the profile. NEVER invent employers, titles, dates or metrics.\n"
        "- Mirror the posting's language/keywords where the profile genuinely supports them.\n\n"
        f"JOB POSTING:\n{posting[:4000]}\n\n"
        f"CANDIDATE PROFILE:\n{profile_text[:4000]}\n\n"
        f"Return ONLY JSON in exactly this shape: {schema}"
    )
    out = llm.generate_json(prompt, system="You are an expert resume and cover-letter writer. Output only JSON.")
    if not out or "tailored_resume" not in out:
        return None
    # Normalise.
    tr = out.get("tailored_resume") or {}
    if "sections" not in tr:
        return None
    return {
        "company": str(out.get("company", "") or ""),
        "role": str(out.get("role", "") or ""),
        "location": str(out.get("location", "") or ""),
        "requirements": [str(r) for r in (out.get("requirements") or [])][:15],
        "gaps": [str(g) for g in (out.get("gaps") or [])][:12],
        "tailored_resume": tr,
        "cover_letter": str(out.get("cover_letter", "") or ""),
    }


def _tailor_heuristic(posting: str, profile: dict, profile_text: str) -> dict:
    basics = _extract_basics_heuristic(posting)
    reqs = _requirements_heuristic(posting)

    # Build a tailored resume from the profile, ordering skills that match the
    # posting first.
    matched, missing, _ = keyword_match(profile_text, posting)
    sections = []
    if profile.get("summary"):
        sections.append({"title": "Summary", "lines": [profile["summary"]]})
    if profile.get("experience"):
        exp_lines = []
        for exp in profile["experience"]:
            if isinstance(exp, dict):
                head = " | ".join(str(exp.get(k, "")) for k in ("role", "company", "dates") if exp.get(k))
                if head:
                    exp_lines.append(head)
                for b in exp.get("bullets", []) or []:
                    exp_lines.append(str(b))
            else:
                exp_lines.append(str(exp))
        if exp_lines:
            sections.append({"title": "Experience", "lines": exp_lines})
    if profile.get("skills"):
        skills = [str(s) for s in profile["skills"]]
        skills.sort(key=lambda s: s.lower() not in [m.lower() for m in matched])
        sections.append({"title": "Skills", "lines": [", ".join(skills)]})
    if profile.get("projects"):
        proj_lines = [
            (p.get("name", "") + ((": " + p.get("description", "")) if p.get("description") else ""))
            if isinstance(p, dict) else str(p)
            for p in profile["projects"]
        ]
        sections.append({"title": "Projects", "lines": [p for p in proj_lines if p]})
    if profile.get("education"):
        edu_lines = [
            " | ".join(str(e.get(k, "")) for k in ("degree", "institution", "year") if e.get(k))
            if isinstance(e, dict) else str(e)
            for e in profile["education"]
        ]
        sections.append({"title": "Education", "lines": [e for e in edu_lines if e]})

    tailored_resume = {
        "contact": {
            "name": profile.get("full_name", ""),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "location": profile.get("location", ""),
            "links": profile.get("links", []),
        },
        "sections": sections,
    }

    company = basics["company"] or "the company"
    role = basics["role"] or "the role"
    name = profile.get("full_name", "")
    cover = (
        f"Dear Hiring Manager,\n\n"
        f"I am writing to apply for {role} at {company}. "
        f"{profile.get('summary', '').strip()}\n\n"
        "My background aligns with your needs"
        + (f", particularly in {', '.join(matched[:6])}." if matched else ".")
        + "\n\nI would welcome the chance to discuss how I can contribute.\n\n"
        f"Sincerely,\n{name}"
    )

    gaps = [m for m in missing if len(m) > 2][:10]
    return {
        "company": basics["company"],
        "role": basics["role"],
        "location": basics["location"],
        "requirements": reqs,
        "gaps": gaps,
        "tailored_resume": tailored_resume,
        "cover_letter": cover,
    }
