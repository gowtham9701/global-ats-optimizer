"""FastAPI entrypoint for the Global ATS Resume Optimizer & Agentic Architect.

Endpoints
---------
GET  /                 Health & metadata
GET  /api/health       Liveness probe
GET  /api/templates    Available resume templates
GET  /api/tools        Registered agent tools (transparency)
POST /api/upload       Parse an uploaded PDF/DOCX into a semantic resume
POST /api/analyze      Run the agentic ATS analysis (score, highlights, RAG)
POST /api/localize     Convert a resume to another country's conventions
POST /api/generate-pdf Render a parsed resume to a styled PDF
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.agents.copilot import chat as copilot_chat
from app.agents.optimizer_agent import run_agent
from app.agents.tools import TOOL_REGISTRY
from app.config import settings
from app.models.schemas import (
    AnalyzeRequest,
    AnalysisResult,
    ChatRequest,
    ChatResponse,
    GeneratePdfRequest,
    GenerateResumeRequest,
    GenerateResumeResult,
    LocalizeRequest,
    LocalizeResult,
    UploadResponse,
)
from app.services import parser
from app.services.llm_provider import get_llm
from app.services.localization import localize_resume
from app.services.pdf_generator import generate_pdf, list_templates
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


@app.get("/")
def root() -> dict:
    llm = get_llm()
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_live": llm.is_live,
        "llm_model": getattr(llm, "_model_name", None) if llm.is_live else None,
        "docs": "/docs",
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


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
    return run_agent(req.resume_text, req.job_description, req.target_country)


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
    return copilot_chat(
        req.messages, req.resume_text, req.parsed, req.job_description, req.target_country
    )


@app.post("/api/localize", response_model=LocalizeResult)
def localize(req: LocalizeRequest) -> LocalizeResult:
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")
    return localize_resume(req.resume_text, req.target_country)


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
