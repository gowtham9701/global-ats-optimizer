"""FastAPI entrypoint for the Global ATS Resume Optimizer & Agentic Architect.

Endpoints
---------
GET  /                  Health & metadata (LLM + DB status)
GET  /api/health        Liveness probe (+ DB ping)
GET  /api/templates     Available resume templates
GET  /api/tools         Registered agent tools (transparency)
GET  /api/history       Persisted ATS score history (Neon)
POST /api/upload        Parse an uploaded PDF/DOCX into a semantic resume
POST /api/analyze       Run the agentic ATS analysis (score, highlights, RAG)
POST /api/generate-resume  Draft a resume from a free-text description (LLM)
POST /api/chat          Conversational copilot (single response)
POST /api/chat/stream   Conversational copilot (streaming SSE, token-by-token)
POST /api/localize      Convert a resume to another country's conventions
POST /api/format-check  Verify a resume against a country's format conventions
POST /api/generate-pdf  Render a parsed resume to a styled PDF
POST /api/render-preview  Render the exact preview HTML (WYSIWYG) of a resume
"""
from __future__ import annotations

import json
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.agents.copilot import chat as copilot_chat
from app.agents.copilot import stream_chat as copilot_stream_chat
from app.agents.optimizer_agent import run_agent
from app.agents.tools import TOOL_REGISTRY
from app.config import settings
from app.models.schemas import (
    AnalyzeRequest,
    AnalysisResult,
    ChatRequest,
    ChatResponse,
    FormatCheckRequest,
    FormatCheckResult,
    GeneratePdfRequest,
    GenerateResumeRequest,
    GenerateResumeResult,
    LocalizeRequest,
    LocalizeResult,
    ScoreHistoryResponse,
    UploadResponse,
)
from app.services import database
from app.services import parser
from app.services.format_check import check_format
from app.services.llm_provider import get_llm
from app.services.localization import localize_resume
from app.services.pdf_generator import generate_pdf, list_templates, render_html
from app.services.resume_builder import generate_resume

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    database.init_db()


@app.get("/")
def root() -> dict:
    llm = get_llm()
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_live": llm.is_live,
        "llm_model": getattr(llm, "_model_name", None) if llm.is_live else None,
        "db_enabled": database.is_enabled(),
        "docs": "/docs",
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "db": database.ping()}


@app.get("/api/llm-diagnostics")
def llm_diagnostics(test_generate: bool = False) -> dict:
    # test_generate defaults to False so this endpoint never consumes the
    # free-tier generation quota unless explicitly requested (?test_generate=true).
    return get_llm().diagnose(test_generate=test_generate)


@app.get("/api/templates")
def templates() -> list:
    return list_templates()


@app.get("/api/tools")
def tools() -> list:
    return [
        {"name": name, "description": meta["description"]}
        for name, meta in TOOL_REGISTRY.items()
    ]


@app.post("/api/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    data = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_MB}MB limit.")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")
    parsed = parser.parse_upload(file.filename or "resume.txt", data)
    if not parsed.raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the file.")
    return UploadResponse(parsed=parsed)


@app.post("/api/analyze", response_model=AnalysisResult)
def analyze(req: AnalyzeRequest) -> AnalysisResult:
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")
    result = run_agent(req.resume_text, req.job_description, req.target_country)
    # Persist a lightweight score event (no resume content) for history/trends.
    try:
        database.record_score_event(
            session_id=req.session_id,
            total_score=result.total_score,
            breakdown=result.breakdown.model_dump(),
            target_country=req.target_country,
            template=req.template,
            word_count=req.word_count or len(req.resume_text.split()),
        )
    except Exception:  # pragma: no cover - persistence must never break scoring
        logger.exception("Failed to persist score event")
    return result


@app.get("/api/history", response_model=ScoreHistoryResponse)
def history(session_id: str = "", limit: int = 20) -> ScoreHistoryResponse:
    events = database.get_score_history(session_id, limit=limit)
    return ScoreHistoryResponse(enabled=database.is_enabled(), events=events)


@app.post("/api/generate-resume", response_model=GenerateResumeResult)
def generate_resume_endpoint(req: GenerateResumeRequest) -> GenerateResumeResult:
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="description is required.")
    return generate_resume(
        req.description, req.target_country, req.full_name, req.email, req.phone
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is required.")
    resp = copilot_chat(
        req.messages, req.resume_text, req.parsed, req.job_description, req.target_country
    )
    try:
        last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        if last_user:
            database.record_chat_message(session_id=req.session_id, role="user", content=last_user)
        database.record_chat_message(
            session_id=req.session_id, role="assistant", content=resp.reply, source=resp.source
        )
    except Exception:  # pragma: no cover
        logger.exception("Failed to persist chat message")
    return resp


@app.post("/api/chat/stream")
def chat_stream_endpoint(req: ChatRequest) -> StreamingResponse:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is required.")

    def event_stream():
        meta_holder: dict = {}
        full_reply_parts: list = []
        for event in copilot_stream_chat(
            req.messages, req.resume_text, req.parsed, req.job_description, req.target_country
        ):
            etype = event.get("type")
            if etype == "token":
                full_reply_parts.append(event.get("text", ""))
            elif etype == "final":
                meta_holder.update(event)
            yield f"data: {json.dumps(event)}\n\n"
        # Persist the completed assistant turn.
        try:
            last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
            if last_user:
                database.record_chat_message(session_id=req.session_id, role="user", content=last_user)
            reply_text = meta_holder.get("reply") or "".join(full_reply_parts)
            if reply_text:
                database.record_chat_message(
                    session_id=req.session_id,
                    role="assistant",
                    content=reply_text,
                    source=meta_holder.get("source", ""),
                )
        except Exception:  # pragma: no cover
            logger.exception("Failed to persist streamed chat message")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/localize", response_model=LocalizeResult)
def localize(req: LocalizeRequest) -> LocalizeResult:
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")
    return localize_resume(req.resume_text, req.target_country)


@app.post("/api/format-check", response_model=FormatCheckResult)
def format_check(req: FormatCheckRequest) -> FormatCheckResult:
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")
    return check_format(req.resume_text, req.target_country)


@app.post("/api/generate-pdf")
def generate_pdf_endpoint(req: GeneratePdfRequest) -> Response:
    try:
        pdf_bytes = generate_pdf(req.parsed, req.template, req.accent_color)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
    filename = f"resume_{req.template}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/render-preview")
def render_preview_endpoint(req: GeneratePdfRequest) -> Response:
    """Return the exact HTML that becomes the PDF, for a true WYSIWYG preview."""
    try:
        html = render_html(req.parsed, req.template, req.accent_color)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Preview render failed")
        raise HTTPException(status_code=500, detail=f"Preview render failed: {exc}")
    return Response(content=html, media_type="text/html")
