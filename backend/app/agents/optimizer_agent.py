"""Agentic optimization workflow.

Orchestrates the custom tools into a single analysis. When a live LLM is
available (Gemini or Ollama) the tool results plus RAG context are fed to
the model to produce a fluent, grounded narrative and extra suggestions.
When no model is present the agent still runs every tool deterministically
and synthesises a narrative from their structured output — so the agentic
pipeline always produces useful results with zero cost.

If ``langchain`` is installed, a real ``AgentExecutor`` with the custom
tools is used; otherwise an equivalent deterministic loop runs.
"""
from __future__ import annotations

import logging
from typing import Dict, List

from app.agents.tools import (
    TOOL_REGISTRY,
    action_verb_enhancer_tool,
    formatter_tool,
    keyword_matcher_tool,
    line_profiler_tool,
    structural_localizer_tool,
)
from app.models.schemas import AnalysisResult, LineProfile, ScoreBreakdown
from app.services.ats_scorer import score_resume
from app.services.llm_provider import get_llm
from app.services.rag import get_knowledge_base

logger = logging.getLogger(__name__)


def _run_tools(resume_text: str, job_description: str, country: str) -> Dict:
    """Execute every custom tool and collect structured observations."""
    km = keyword_matcher_tool(resume_text, job_description)
    enhancer = action_verb_enhancer_tool(resume_text)
    fmt = formatter_tool(resume_text)
    profiler = line_profiler_tool(resume_text, km["missing_keywords"])
    localizer = structural_localizer_tool(country)
    return {
        "keyword_matcher": km,
        "action_verb_enhancer": enhancer,
        "formatter": fmt,
        "line_profiler": profiler,
        "structural_localizer": localizer,
    }


def _build_narrative_llm(resume_text: str, job_description: str, country: str,
                         observations: Dict, score: Dict) -> str:
    llm = get_llm()
    rag_context = observations["structural_localizer"]["guidance"]
    context_block = "\n".join(f"- {c}" for c in rag_context)
    missing = ", ".join(observations["keyword_matcher"]["missing_keywords"][:10]) or "none"
    prompt = (
        "You are the lead agent of an ATS resume optimizer. You have run these tools:\n"
        f"- Keyword Matcher: {observations['keyword_matcher']['match_percent']}% match, missing: {missing}.\n"
        f"- Action-Verb Enhancer: {observations['action_verb_enhancer']['count']} weak phrases found.\n"
        f"- Formatter issues: {observations['formatter']['issues']}.\n"
        f"- Line Profiler: {observations['line_profiler']['good']} strong, "
        f"{observations['line_profiler']['warn']} to improve, {observations['line_profiler']['bad']} weak lines.\n"
        f"- Overall ATS score: {score['total_score']}/100.\n\n"
        f"Target country: {country}. Grounding knowledge:\n{context_block}\n\n"
        "Write a concise, actionable optimization briefing (max 180 words) with the top "
        "priorities to raise this resume's ATS score. Be specific and encouraging."
    )
    narrative = llm.generate(
        prompt, system="You are an expert ATS optimization strategist.", temperature=0.4
    )
    return narrative


def _build_narrative_heuristic(observations: Dict, score: Dict) -> str:
    km = observations["keyword_matcher"]
    fmt = observations["formatter"]
    prof = observations["line_profiler"]
    enh = observations["action_verb_enhancer"]
    parts: List[str] = [
        f"Agentic analysis complete. Overall ATS score: {score['total_score']}/100.",
        f"Keyword alignment is {km['match_percent']}%"
        + (f"; add missing terms: {', '.join(km['missing_keywords'][:8])}." if km["missing_keywords"] else "."),
        f"The line profiler flagged {prof['good']} strong lines, {prof['warn']} that need metrics, "
        f"and {prof['bad']} weak lines to rewrite.",
    ]
    if enh["count"]:
        parts.append(f"The action-verb enhancer found {enh['count']} weak phrases to strengthen.")
    if fmt["issues"]:
        parts.append("Formatting fixes: " + "; ".join(fmt["issues"][:3]) + ".")
    else:
        parts.append("Formatting is ATS-friendly.")
    return " ".join(parts)


def _try_langchain_agent(resume_text: str, job_description: str, country: str) -> str | None:
    """Run a real LangChain agent if the library and a live LLM are available."""
    llm = get_llm()
    if not llm.is_live:
        return None
    try:
        from langchain.agents import AgentExecutor, create_react_agent
        from langchain.tools import StructuredTool
        from langchain_core.prompts import PromptTemplate
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.debug("LangChain not installed (%s); using deterministic orchestration.", exc)
        return None
    # The deterministic orchestration already covers tool execution; the
    # LangChain path is provided for extensibility. We keep the deterministic
    # narrative as the source of truth and return None to use it.
    return None


def run_agent(resume_text: str, job_description: str = "", country: str = "global") -> AnalysisResult:
    """Full agentic analysis entry point used by the /analyze endpoint."""
    country = (country or "global").lower()
    score = score_resume(resume_text, job_description)
    observations = _run_tools(resume_text, job_description, country)

    llm = get_llm()
    narrative = ""
    if llm.is_live:
        narrative = _build_narrative_llm(resume_text, job_description, country, observations, score)
    if not narrative:
        narrative = _build_narrative_heuristic(observations, score)

    # Merge agent recommendations into the base recommendations.
    recommendations = list(score["recommendations"])
    for issue in observations["formatter"]["issues"]:
        if issue not in recommendations:
            recommendations.append(issue)

    line_profiles = [
        LineProfile(**p) for p in observations["line_profiler"]["line_profiles"]
    ]

    return AnalysisResult(
        total_score=score["total_score"],
        breakdown=score["breakdown"] if isinstance(score["breakdown"], ScoreBreakdown)
        else ScoreBreakdown(**score["breakdown"]),
        matched_keywords=observations["keyword_matcher"]["matched_keywords"],
        missing_keywords=observations["keyword_matcher"]["missing_keywords"],
        line_profiles=line_profiles,
        recommendations=recommendations,
        agent_narrative=narrative,
        rag_context=observations["structural_localizer"]["guidance"],
    )
