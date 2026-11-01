"""Conversational resume copilot.

A side-panel assistant that answers questions about the user's resume and can
apply concrete modifications. It is grounded by the same tools used elsewhere
(ATS scorer, keyword matcher, RAG knowledge base). With a live LLM present it
streams fluent, context-aware replies token-by-token (so the UI genuinely
"thinks" in real time); otherwise a capable deterministic assistant handles the
common intents so the copilot always works.
"""
from __future__ import annotations

import re
from typing import Dict, Iterator, List, Optional

from app.agents.tools import (
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

# Verbs that imply the user wants the resume itself changed/rewritten.
EDIT_INTENT = re.compile(
    r"\b(improve|rewrite|re-?write|optimi[sz]e|enhance|strengthen|apply|polish|"
    r"boost|upgrade|refine|tailor|revis|shorten|condense|expand|quantify|"
    r"add (missing )?keywords?|make (it|my|the)\b.*\b(better|stronger|concise|"
    r"shorter|impactful|punchier|crisp))\b", re.I
)
# Advice/question phrasing should be answered, not trigger a silent rewrite.
ADVICE_INTENT = re.compile(
    r"\b(tips?|advice|suggest|recommend|how (do|should|can|would) i|what should|"
    r"why|explain|should i|what is|what are|which|give me (a |some |one )?(tip|advice|idea))\b", re.I
)
SCORE_INTENT = re.compile(r"\b(score|ats|rating|how good|evaluate|assess|grade)\b", re.I)
KEYWORD_INTENT = re.compile(r"\b(keyword|missing|match|job description|jd)\b", re.I)
SUGGEST_CHIPS = [
    "Improve my weak bullet points",
    "Add missing keywords from the job description",
    "Make my summary more impactful",
    "What is my ATS score and why?",
]
EDIT_CHIPS = ["Apply to editor", "Make the summary more concise", "What else can I improve?"]


def _is_edit(user_msg: str) -> bool:
    if not EDIT_INTENT.search(user_msg):
        return False
    # Questions ("...?") and advice phrasing ("tip", "how do I", "what should")
    # are answered rather than triggering a silent rewrite.
    if re.search(r"\?\s*$", user_msg):
        return False
    if ADVICE_INTENT.search(user_msg):
        return False
    return True


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


def _build_messages(user_msg: str, messages: List[ChatMessage], resume_text: str,
                    job_description: str, country: str, g: dict) -> list:
    rag_block = "\n".join(f"- {c}" for c in g["rag"])
    missing = ", ".join(g["km"]["missing_keywords"][:8]) or "none"
    system = (
        "You are an expert, friendly resume copilot for a global ATS optimizer. "
        "Give concise, specific, actionable answers (max ~160 words). Refer to "
        "concrete details from the user's resume. Use short paragraphs or bullet "
        "points. Never invent experience the user doesn't have."
    )
    context = (
        f"Live analysis of the user's resume:\n"
        f"- ATS score: {g['score']['total_score']}/100\n"
        f"- Keyword match: {g['km']['match_percent']}%; missing keywords: {missing}\n"
        f"- Lines: {g['prof']['good']} strong / {g['prof']['warn']} to improve / {g['prof']['bad']} weak\n"
        f"- Target country: {country}\n"
        f"Country ATS guidance:\n{rag_block}\n\n"
        f"Resume content:\n{resume_text[:3000]}"
    )
    out = [{"role": "system", "content": system + "\n\n" + context}]
    for m in messages[-6:]:
        if m.role in ("user", "assistant"):
            out.append({"role": m.role, "content": m.content})
    if not out or out[-1]["role"] != "user":
        out.append({"role": "user", "content": user_msg})
    return out


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
        "Say 'improve my resume' and I'll rewrite them and update the editor for you."
    )
    if g["rag"]:
        parts.append("Tip: " + g["rag"][0])
    return " ".join(parts)


def _do_edit(current_parsed: ParsedResume, job_description: str, country: str,
             user_msg: str, prev_score: int) -> ChatResponse:
    improved, changes, source = improve_resume(
        current_parsed, job_description, country, instruction=user_msg
    )
    new_score = score_resume(improved.raw_text, job_description)["total_score"]
    reply = (
        "Done — I rewrote your resume. " + " ".join(changes) +
        f" Projected ATS score: **{new_score}/100** (was {prev_score}). "
        "Click 'Apply to editor' to load these changes."
    )
    return ChatResponse(
        reply=reply,
        suggestions=EDIT_CHIPS,
        updated_parsed=improved,
        updated_resume_text=improved.raw_text,
        did_edit=True,
        source=source,
    )


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

    if _is_edit(user_msg):
        return _do_edit(current_parsed, job_description, country, user_msg, g["score"]["total_score"])

    llm = get_llm()
    reply = ""
    source = "heuristic"
    if llm.is_live:
        msgs = _build_messages(user_msg, messages, effective_text, job_description, country, g)
        if llm.provider == "openrouter":
            reply = llm.chat_openrouter(msgs, temperature=0.4)
        else:
            reply = llm.generate(user_msg, system=msgs[0]["content"], temperature=0.4)
        if reply:
            source = "llm"
    if not reply:
        reply = _heuristic_reply(user_msg, g, country)
        source = "heuristic"
    return ChatResponse(reply=reply, suggestions=SUGGEST_CHIPS, source=source)


def stream_chat(messages: List[ChatMessage], resume_text: str, parsed: Optional[ParsedResume],
                job_description: str, country: str) -> Iterator[Dict]:
    """Yield SSE events: status / token / final.

    * ``status`` - a short "thinking" indicator the UI can display.
    * ``token``  - an incremental chunk of the streamed answer.
    * ``final``  - the completed reply plus suggestions and any resume edit.
    """
    country = (country or "global").lower()
    user_msg = _last_user_message(messages)
    current_parsed = _ensure_parsed(parsed, resume_text)

    if current_parsed is None:
        yield {
            "type": "final",
            "reply": "Upload or create a resume first, then I can analyze it, answer questions, "
                     "and rewrite it for a higher ATS score.",
            "suggestions": ["Create a resume from a description", "Upload an existing resume"],
            "did_edit": False,
            "source": "heuristic",
        }
        return

    effective_text = resume_text.strip() or current_parsed.raw_text

    # Edit intent: show progress, perform the rewrite, return updated resume.
    if _is_edit(user_msg):
        yield {"type": "status", "text": "Analyzing your resume and rewriting for impact…"}
        g = _grounding(effective_text, job_description, country)
        resp = _do_edit(current_parsed, job_description, country, user_msg, g["score"]["total_score"])
        yield {
            "type": "final",
            "reply": resp.reply,
            "suggestions": resp.suggestions,
            "updated_parsed": resp.updated_parsed.model_dump() if resp.updated_parsed else None,
            "updated_resume_text": resp.updated_resume_text,
            "did_edit": True,
            "source": resp.source,
        }
        return

    yield {"type": "status", "text": "Thinking…"}
    g = _grounding(effective_text, job_description, country)
    llm = get_llm()

    streamed = ""
    if llm.is_live and llm.provider == "openrouter":
        msgs = _build_messages(user_msg, messages, effective_text, job_description, country, g)
        for chunk in llm.stream_openrouter(msgs, temperature=0.4):
            streamed += chunk
            yield {"type": "token", "text": chunk}

    if streamed.strip():
        yield {
            "type": "final",
            "reply": streamed.strip(),
            "suggestions": SUGGEST_CHIPS,
            "did_edit": False,
            "source": "llm",
        }
        return

    # Fallback (no live LLM or empty stream): non-streamed heuristic answer.
    reply = _heuristic_reply(user_msg, g, country)
    yield {"type": "final", "reply": reply, "suggestions": SUGGEST_CHIPS,
           "did_edit": False, "source": "heuristic"}
