"""Pydantic schemas shared across the API."""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ContactInfo(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    links: List[str] = Field(default_factory=list)


class ResumeSection(BaseModel):
    title: str
    lines: List[str] = Field(default_factory=list)


class ParsedResume(BaseModel):
    """Semantic representation of an uploaded resume."""

    raw_text: str
    contact: ContactInfo = Field(default_factory=ContactInfo)
    sections: List[ResumeSection] = Field(default_factory=list)
    word_count: int = 0


class LineProfile(BaseModel):
    """Line-by-line diagnostic used by the highlighter UI."""

    text: str
    verdict: str  # "good" | "warn" | "bad" | "neutral"
    reason: str = ""
    suggestion: str = ""


class ScoreBreakdown(BaseModel):
    keyword_density: int
    formatting: int
    quantifiable_metrics: int
    impact_verbs: int
    structure: int


class AnalysisResult(BaseModel):
    total_score: int
    breakdown: ScoreBreakdown
    matched_keywords: List[str] = Field(default_factory=list)
    missing_keywords: List[str] = Field(default_factory=list)
    line_profiles: List[LineProfile] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    agent_narrative: str = ""
    rag_context: List[str] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str = ""
    target_country: str = "global"


class LocalizeRequest(BaseModel):
    resume_text: str
    target_country: str = "germany"


class LocalizeResult(BaseModel):
    target_country: str
    converted_text: str
    structural_notes: List[str] = Field(default_factory=list)
    removed_fields: List[str] = Field(default_factory=list)


class GeneratePdfRequest(BaseModel):
    parsed: ParsedResume
    template: str = "tech_minimalist"
    accent_color: str = "#2563eb"


class GenerateResumeRequest(BaseModel):
    """Create a resume from a free-text prompt / description."""

    description: str
    target_country: str = "global"
    full_name: str = ""
    email: str = ""
    phone: str = ""


class GenerateResumeResult(BaseModel):
    parsed: ParsedResume
    resume_text: str
    source: str = "heuristic"  # "llm" | "heuristic"


class UploadResponse(BaseModel):
    parsed: ParsedResume
    message: str = "Parsed successfully"


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    """Conversational copilot request."""

    messages: List[ChatMessage] = Field(default_factory=list)
    resume_text: str = ""
    parsed: Optional[ParsedResume] = None
    job_description: str = ""
    target_country: str = "global"


class ChatResponse(BaseModel):
    reply: str
    suggestions: List[str] = Field(default_factory=list)
    # When the copilot modifies the resume it returns the updated structure so
    # the UI can load it straight into the editor (becoming the latest result).
    updated_parsed: Optional[ParsedResume] = None
    updated_resume_text: str = ""
    did_edit: bool = False
    source: str = "heuristic"  # "llm" | "heuristic"


class TemplateInfo(BaseModel):
    id: str
    name: str
    description: str
