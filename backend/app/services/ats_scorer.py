"""Deterministic ATS scoring engine.

Produces a benchmark score out of 100 from five weighted components plus a
line-by-line diagnostic (the "Key Line Highlighter" data). This runs with
zero external dependencies so scoring always works, and the agentic layer
can enrich the results on top.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List, Set, Tuple

from app.models.schemas import LineProfile, ScoreBreakdown

# Strong action / impact verbs rewarded by ATS and recruiters.
IMPACT_VERBS: Set[str] = {
    "accelerated", "achieved", "architected", "automated", "boosted", "built",
    "championed", "created", "cut", "delivered", "deployed", "designed",
    "developed", "directed", "drove", "engineered", "enhanced", "established",
    "generated", "grew", "implemented", "improved", "increased", "initiated",
    "launched", "led", "managed", "migrated", "optimized", "orchestrated",
    "overhauled", "pioneered", "reduced", "refactored", "resolved", "scaled",
    "shipped", "spearheaded", "streamlined", "transformed", "won",
}

# Weak / generic phrasing penalised by the highlighter.
WEAK_PHRASES: List[str] = [
    "responsible for", "worked on", "helped with", "assisted in", "duties included",
    "involved in", "participated in", "tasked with", "in charge of", "hard working",
    "team player", "detail oriented", "go-getter", "think outside the box",
    "results-driven", "self-motivated", "various tasks", "day to day",
]

STOPWORDS: Set[str] = {
    "the", "and", "for", "with", "that", "this", "from", "have", "has", "was",
    "were", "are", "you", "your", "our", "their", "they", "them", "a", "an",
    "to", "of", "in", "on", "at", "by", "as", "is", "it", "be", "or", "we",
    "will", "can", "all", "any", "but", "not", "who", "what", "when", "which",
}

METRIC_RE = re.compile(r"(\$?\d[\d,.]*\s?(?:%|percent|k|m|bn|billion|million|hours|users|customers|x|\+)?)", re.I)
BULLET_RE = re.compile(r"^\s*[-•*▪◦‣>]\s*")


def _tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z+#.\-]{1,}", text)
    cleaned = []
    for tok in tokens:
        # Strip leading/trailing punctuation that regex may have captured
        # (e.g. "experience." -> "experience") while keeping "c++", "ci/cd".
        tok = tok.strip(".-")
        if tok:
            cleaned.append(tok.lower())
    return cleaned


def extract_keywords(text: str, top_n: int = 30) -> List[str]:
    """Extract salient keywords from a job description or resume."""
    tokens = [t for t in _tokenize(text) if t not in STOPWORDS and len(t) > 2]
    counts = Counter(tokens)
    return [word for word, _ in counts.most_common(top_n)]


def keyword_match(resume_text: str, job_description: str) -> Tuple[List[str], List[str], float]:
    """Compare resume against JD keywords. Returns matched, missing, ratio."""
    if not job_description.strip():
        # No JD supplied: use the resume's own keyword richness as a proxy.
        kws = extract_keywords(resume_text, 20)
        return kws[:12], [], 1.0 if kws else 0.0
    jd_keywords = extract_keywords(job_description, 30)
    resume_tokens = set(_tokenize(resume_text))
    matched = [k for k in jd_keywords if k in resume_tokens]
    missing = [k for k in jd_keywords if k not in resume_tokens]
    ratio = len(matched) / len(jd_keywords) if jd_keywords else 0.0
    return matched, missing, ratio


def _count_metrics(text: str) -> int:
    return len([m for m in METRIC_RE.findall(text) if any(c.isdigit() for c in m)])


def _count_impact_verbs(text: str) -> int:
    tokens = set(_tokenize(text))
    return len(tokens & IMPACT_VERBS)


def _formatting_score(text: str) -> Tuple[int, List[str]]:
    """Heuristic formatting health check (0-100) with notes."""
    notes: List[str] = []
    score = 100
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines:
        return 0, ["Empty document"]

    # Penalise tables / columns detected as runs of multiple spaces or tabs.
    tabby = sum(1 for l in lines if "\t" in l or re.search(r"\s{4,}\S+\s{4,}", l))
    if tabby > len(lines) * 0.2:
        score -= 20
        notes.append("Multi-column / table layout detected — many ATS cannot parse columns.")

    # Reward bullet usage.
    bullets = sum(1 for l in lines if BULLET_RE.match(l))
    if bullets < 3:
        score -= 15
        notes.append("Few bullet points — use concise bullets for achievements.")

    # Penalise overly long lines (dense paragraphs).
    long_lines = sum(1 for l in lines if len(l) > 200)
    if long_lines:
        score -= 10
        notes.append("Dense paragraphs found — break into bullets.")

    # Reward presence of common sections.
    lowered = text.lower()
    for required in ("experience", "education", "skills"):
        if required not in lowered:
            score -= 8
            notes.append(f"Missing a clear '{required.title()}' section.")

    return max(score, 0), notes


def _structure_score(text: str) -> int:
    lowered = text.lower()
    present = sum(1 for s in ("summary", "experience", "education", "skills", "projects") if s in lowered)
    return min(int(present / 5 * 100), 100)


def profile_lines(text: str, missing_keywords: List[str]) -> List[LineProfile]:
    """Produce the color-coded, line-by-line diagnostic."""
    profiles: List[LineProfile] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        lowered = line.lower()
        verdict = "neutral"
        reason = ""
        suggestion = ""

        weak_hit = next((p for p in WEAK_PHRASES if p in lowered), None)
        has_metric = _count_metrics(line) > 0
        starts_verb = _tokenize(line)[:1] and _tokenize(line)[0] in IMPACT_VERBS

        if weak_hit:
            verdict = "bad"
            reason = f"Generic phrasing: '{weak_hit}'."
            suggestion = _rewrite_weak(line, weak_hit)
        elif BULLET_RE.match(raw) or starts_verb:
            if has_metric and (starts_verb or _count_impact_verbs(line)):
                verdict = "good"
                reason = "Strong action verb with a quantifiable result."
            elif starts_verb:
                verdict = "good"
                reason = "Begins with an impact verb."
                if not has_metric:
                    verdict = "warn"
                    reason = "Good action verb but no measurable outcome."
                    suggestion = line + " — add a metric (e.g. 'by 30%', 'for 10k users')."
            else:
                verdict = "warn"
                reason = "Bullet lacks a strong action verb."
                suggestion = "Start with a verb like 'Led', 'Built', 'Reduced'."
        profiles.append(
            LineProfile(text=line, verdict=verdict, reason=reason, suggestion=suggestion)
        )
    return profiles


def _rewrite_weak(line: str, weak: str) -> str:
    mapping = {
        "responsible for": "Led",
        "worked on": "Built",
        "helped with": "Drove",
        "assisted in": "Supported",
        "duties included": "Delivered",
        "involved in": "Contributed to",
        "participated in": "Collaborated on",
        "tasked with": "Owned",
        "in charge of": "Directed",
    }
    replacement = mapping.get(weak, "Led")
    pattern = re.compile(re.escape(weak), re.I)
    rewritten = pattern.sub(replacement, line, count=1)
    if "%" not in rewritten and not _count_metrics(rewritten):
        rewritten += " (quantify the impact, e.g. by 25%)"
    return rewritten


def score_resume(resume_text: str, job_description: str = "") -> Dict:
    """Compute the full ATS analysis dictionary."""
    matched, missing, ratio = keyword_match(resume_text, job_description)

    keyword_density = int(round(ratio * 100))
    formatting, fmt_notes = _formatting_score(resume_text)

    metric_count = _count_metrics(resume_text)
    quantifiable = min(metric_count * 12, 100)

    verb_count = _count_impact_verbs(resume_text)
    impact = min(verb_count * 10, 100)

    structure = _structure_score(resume_text)

    breakdown = ScoreBreakdown(
        keyword_density=keyword_density,
        formatting=formatting,
        quantifiable_metrics=quantifiable,
        impact_verbs=impact,
        structure=structure,
    )

    # Weighted total out of 100.
    total = int(round(
        keyword_density * 0.30
        + formatting * 0.20
        + quantifiable * 0.20
        + impact * 0.15
        + structure * 0.15
    ))

    line_profiles = profile_lines(resume_text, missing)

    recommendations = list(fmt_notes)
    if missing:
        recommendations.append(
            "Add missing keywords from the job description: " + ", ".join(missing[:10]) + "."
        )
    if metric_count < 3:
        recommendations.append("Quantify achievements with numbers, %, time saved or revenue.")
    if verb_count < 5:
        recommendations.append("Open bullets with strong impact verbs (Led, Built, Reduced).")

    return {
        "total_score": max(0, min(total, 100)),
        "breakdown": breakdown,
        "matched_keywords": matched,
        "missing_keywords": missing,
        "line_profiles": line_profiles,
        "recommendations": recommendations,
    }
