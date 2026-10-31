"""Custom agent tools for resume optimization.

Each tool is a plain callable with a clear signature so it can be used both
directly (deterministic orchestration) and wrapped as a LangChain
``StructuredTool`` for an LLM-driven agent loop. Keeping the core logic in
plain functions means the agentic workflow is fully testable and never
depends on an external model being present.
"""
from __future__ import annotations

import re
from typing import Dict, List

from app.services.ats_scorer import (
    IMPACT_VERBS,
    WEAK_PHRASES,
    extract_keywords,
    keyword_match,
    profile_lines,
)
from app.services.rag import get_knowledge_base


def keyword_matcher_tool(resume_text: str, job_description: str) -> Dict:
    """Tool: compare a resume against a job description.

    Returns matched keywords, missing keywords and the match ratio so the
    agent can recommend concrete additions.
    """
    matched, missing, ratio = keyword_match(resume_text, job_description)
    return {
        "matched_keywords": matched,
        "missing_keywords": missing,
        "match_ratio": round(ratio, 3),
        "match_percent": int(round(ratio * 100)),
    }


ACTION_VERB_MAP = {
    "responsible for": "Led",
    "worked on": "Built",
    "helped": "Drove",
    "helped with": "Drove",
    "assisted": "Supported",
    "assisted in": "Supported",
    "made": "Created",
    "did": "Executed",
    "handled": "Managed",
    "used": "Leveraged",
    "involved in": "Contributed to",
    "participated in": "Collaborated on",
    "in charge of": "Directed",
    "tasked with": "Owned",
}


def action_verb_enhancer_tool(text: str) -> Dict:
    """Tool: suggest strong action-verb replacements for weak phrasing."""
    suggestions: List[Dict[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        lowered = line.lower()
        for weak, strong in ACTION_VERB_MAP.items():
            if re.search(r"\b" + re.escape(weak) + r"\b", lowered):
                improved = re.sub(
                    r"\b" + re.escape(weak) + r"\b", strong, line, count=1, flags=re.I
                )
                suggestions.append({"original": line, "improved": improved, "verb": strong})
                break
    return {"suggestions": suggestions, "count": len(suggestions)}


def formatter_tool(text: str) -> Dict:
    """Tool: detect ATS-hostile formatting and propose structural fixes."""
    issues: List[str] = []
    lines = [l for l in text.splitlines() if l.strip()]
    if any("\t" in l or re.search(r"\s{4,}\S+\s{4,}", l) for l in lines):
        issues.append("Possible multi-column/table layout — convert to single column.")
    if sum(1 for l in lines if re.match(r"^\s*[-•*]", l)) < 3:
        issues.append("Add concise bullet points for achievements.")
    lowered = text.lower()
    for sec in ("summary", "experience", "education", "skills"):
        if sec not in lowered:
            issues.append(f"Add a clearly labelled '{sec.title()}' section.")
    return {"issues": issues, "is_ats_friendly": len(issues) == 0}


def line_profiler_tool(text: str, missing_keywords: List[str] | None = None) -> Dict:
    """Tool: line-by-line profiling for the color-coded highlighter."""
    profiles = profile_lines(text, missing_keywords or [])
    return {
        "line_profiles": [p.model_dump() for p in profiles],
        "good": sum(1 for p in profiles if p.verdict == "good"),
        "warn": sum(1 for p in profiles if p.verdict == "warn"),
        "bad": sum(1 for p in profiles if p.verdict == "bad"),
    }


def structural_localizer_tool(country: str) -> Dict:
    """Tool: retrieve country-specific structural localization guidance via RAG."""
    kb = get_knowledge_base()
    context = kb.retrieve(
        f"{country} resume CV structure privacy standards", country=country, k=4
    )
    return {"country": country, "guidance": context}


# Registry consumed by the agent and exposed via the API for transparency.
TOOL_REGISTRY = {
    "keyword_matcher": {
        "fn": keyword_matcher_tool,
        "description": "Compare resume text against a job description to find matched and missing keywords.",
    },
    "action_verb_enhancer": {
        "fn": action_verb_enhancer_tool,
        "description": "Replace weak phrases with strong action verbs.",
    },
    "formatter": {
        "fn": formatter_tool,
        "description": "Detect ATS-hostile formatting and suggest structural fixes.",
    },
    "line_profiler": {
        "fn": line_profiler_tool,
        "description": "Profile each line and classify it good/warn/bad for the highlighter.",
    },
    "structural_localizer": {
        "fn": structural_localizer_tool,
        "description": "Retrieve country-specific resume structure and privacy guidance (RAG).",
    },
}
