"""Conversational resume copilot.

A side-panel assistant that answers questions about the user's resume and can
apply concrete modifications. It is grounded by the same tools used elsewhere
(ATS scorer, keyword matcher, RAG knowledge base). When a live LLM is present
it produces fluent, context-aware replies; otherwise a capable deterministic
assistant handles the common intents so the copilot always works for free.
"""
from __future__ import annotations

import re
from typing import List, Optional, Tuple

from app.agents.tools import (
    action_verb_enhancer_tool,
    formatter_tool,
    keyword_matcher_tool,
    line_profiler_tool,
)
from app.models.schemas import ChatMessage, ChatResponse, ParsedResume
from app.services.ats_scorer import score_resume
from app.services.llm_provider import get_llm
from app.services.parser import parse_resume
from app.services.rag import get_knowledge_base
from app.services.resume_improver import improve_resume

EDIT_INTENT = re.compile(
    r"\b(improve|rewrite|optimi[sz]e|enhance|fix|strengthen|apply|make it better|"
    r"polish|boost|upgrade|refine|tailor|add keywords?)\b", re.I
)
SCORE_INTENT = re.compile(r"\b(score|ats|rating|how good|evaluate|assess|grade)\b", re.I)
KEYWORD_INTENT = re.compile(r"\b(keyword|missing|match|job description|jd)\b", re.I)
SUGGEST_CHIPS = [
    "Improve my weak bullet points",
    "Add missing keywords from the job description",
    "Make my summary more impactful",
    "What is my ATS score and why?",
]


def _ensure_parsed(req_parsed: Optional[ParsedResume], resume_text: str) -> Optional[ParsedResume]:
    if req_parsed and req_parsed.sections:
        return req_parsed
    if resume_text.strip():
        return parse_resume(resume_text)
    return None


def _last_user_message(messages: List[ChatMessage]) -> str:
    for m in reversed(messages):
        if m.role == "user":
            return m.content
    return ""


def _grounding(resume_text: str, job_description: str, country: str) -> dict:
    score = score_resume(resume_text, job_description)
    km = keyword_matcher_tool(resume_text, job_description)
    prof = line_profiler_tool(resume_text, km["missing_keywords"])
    fmt = formatter_tool(resume_text)
    kb = get_knowledge_base()
    rag = kb.retrieve(f"{country} resume ATS improvement", country=country, k=3)
    return {"score": score, "km": km, "prof": prof, "fmt": fmt, "rag": rag}


def _llm_reply(user_msg: str, messages: List[ChatMessage], resume_text: str,
               job_description: str, country: str, g: dict) -> Optional[str]:
    llm = get_llm()
    if not llm.is_live:
        return None
    history = "\n".join(f"{m.role.upper()}: {m.content}" for m in messages[-6:])
    rag_block = "\n".join(f"- {c}" for c in g["rag"])
    missing = ", ".join(g["km"]["missing_keywords"][:8]) or "none"
    prompt = (
        "You are an expert, friendly resume copilot. Use the context to give a concise, "
        "actionable answer (max 160 words). Refer to specifics from the resume.\n\n"
        f"ATS score: {g['score']['total_score']}/100. Keyword match: {g['km']['match_percent']}%. "
        f"Missing keywords: {missing}. "
        f"Lines: {g['prof']['good']} strong / {g['prof']['warn']} weak-ish / {g['prof']['bad']} weak.\n"
        f"Knowledge:\n{rag_block}\n\n"
        f"Resume:\n{resume_text[:2500]}\n\n"
        f"Conversation so far:\n{history}\n\nUSER: {user_msg}\nASSISTANT:"
    )
    return llm.generate(prompt, system="You are a helpful resume optimization copilot.", temperature=0.4)


def _heuristic_reply(user_msg: str, g: dict, country: str) -> str:
    score = g["score"]["total_score"]
    km = g["km"]
    prof = g["prof"]
    parts: List[str] = []

    if SCORE_INTENT.search(user_msg) or not user_msg:
        parts.append(f"Your current ATS score is **{score}/100**.")
        b = g["score"]["breakdown"]
        weak = sorted(
            [("keyword density", b.keyword_density), ("formatting", b.formatting),
             ("quantifiable metrics", b.quantifiable_metrics), ("impact verbs", b.impact_verbs),
             ("structure", b.structure)],
            key=lambda x: x[1],
        )[:2]
        parts.append("Weakest areas: " + ", ".join(f"{n} ({v}/100)" for n, v in weak) + ".")

    if KEYWORD_INTENT.search(user_msg):
        if km["missing_keywords"]:
            parts.append("Missing keywords to add: " + ", ".join(km["missing_keywords"][:10]) + ".")
        else:
            parts.append(f"Keyword match is {km['match_percent']}% — add a job description for deeper matching.")

    parts.append(
        f"I found {prof['bad']} weak and {prof['warn']} improvable lines. "
        "Say ‘improve my resume’ and I’ll rewrite them and update the editor for you."
    )
    if g["rag"]:
        parts.append("Tip: " + g["rag"][0])
    return " ".join(parts)


def chat(messages: List[ChatMessage], resume_text: str, parsed: Optional[ParsedResume],
         job_description: str, country: str) -> ChatResponse:
    country = (country or "global").lower()
    user_msg = _last_user_message(messages)
    current_parsed = _ensure_parsed(parsed, resume_text)

    if current_parsed is None:
        return ChatResponse(
            reply="Upload or create a resume first, then I can analyze it, answer questions, "
                  "and rewrite it for a higher ATS score.",
            suggestions=["Create a resume from a description", "Upload an existing resume"],
        )

    effective_text = resume_text.strip() or current_parsed.raw_text
    g = _grounding(effective_text, job_description, country)

    # Edit intent → apply modifications and return the updated resume.
    if EDIT_INTENT.search(user_msg):
        improved, changes, source = improve_resume(
            current_parsed, job_description, country, instruction=user_msg
        )
        new_score = score_resume(improved.raw_text, job_description)["total_score"]
        reply = (
            "Done — I rewrote your resume. " + " ".join(changes) +
            f" Projected ATS score: **{new_score}/100** (was {g['score']['total_score']}). "
            "Click ‘Apply to editor’ to load these changes."
        )
        return ChatResponse(
            reply=reply,
            suggestions=["Apply to editor", "Make the summary more concise", "What else can I improve?"],
            updated_parsed=improved,
            updated_resume_text=improved.raw_text,
            did_edit=True,
            source=source,
        )

    # Otherwise answer (LLM if available, else deterministic).
    reply = _llm_reply(user_msg, messages, effective_text, job_description, country, g)
    source = "llm"
    if not reply:
        reply = _heuristic_reply(user_msg, g, country)
        source = "heuristic"
    return ChatResponse(reply=reply, suggestions=SUGGEST_CHIPS, source=source)
