"""Neon Postgres persistence layer.

Stores **only the lightweight, useful data** — never resume file contents or
PDFs (those are rendered on demand on the web). We persist:

* ``score_events``   - each ATS verification (score + component breakdown +
                       country/template) so the dashboard can show history and
                       trends over time.
* ``chat_messages``  - copilot conversation turns, so a session's AI chat is
                       durable and auditable.

The whole layer degrades gracefully: if ``DATABASE_URL`` is not configured, or
the database is unreachable, every function becomes a no-op and the application
keeps working without persistence.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator, List, Optional

from sqlalchemy import (
    Integer,
    String,
    Text,
    JSON,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class ScoreEvent(Base):
    __tablename__ = "score_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    total_score: Mapped[int] = mapped_column(Integer)
    keyword_density: Mapped[int] = mapped_column(Integer, default=0)
    formatting: Mapped[int] = mapped_column(Integer, default=0)
    quantifiable_metrics: Mapped[int] = mapped_column(Integer, default=0)
    impact_verbs: Mapped[int] = mapped_column(Integer, default=0)
    structure: Mapped[int] = mapped_column(Integer, default=0)
    target_country: Mapped[str] = mapped_column(String(32), default="global")
    template: Mapped[str] = mapped_column(String(48), default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ChatMessageRow(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Profile(Base):
    """A single career profile — the source of truth for all tailored docs.

    Structured sections (skills/experience/projects/education/etc.) are stored
    as JSON so the shape can evolve without migrations. No PDFs are stored.
    """

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    headline: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    location: Mapped[str] = mapped_column(String(160), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    links: Mapped[list] = mapped_column(JSON, default=list)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    experience: Mapped[list] = mapped_column(JSON, default=list)
    projects: Mapped[list] = mapped_column(JSON, default=list)
    education: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


class Application(Base):
    """One job application tracked from draft to offer (kanban + table)."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    company: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(160), default="")
    posting_url: Mapped[str] = mapped_column(String(600), default="")
    posting_text: Mapped[str] = mapped_column(Text, default="")
    stage: Mapped[str] = mapped_column(String(32), default="saved", index=True)
    match_score: Mapped[int] = mapped_column(Integer, default=0)
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    gaps: Mapped[list] = mapped_column(JSON, default=list)
    tailored_resume: Mapped[dict] = mapped_column(JSON, default=dict)
    cover_letter: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


# Ordered application stages shared by the API and the board UI.
STAGES = ["saved", "drafting", "applied", "interview", "offer", "rejected"]


_engine = None
_SessionLocal: Optional[sessionmaker] = None
_init_ok = False


def _normalise_url(url: str) -> str:
    # SQLAlchemy + psycopg3 expects the "postgresql+psycopg://" driver prefix.
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def init_db() -> bool:
    """Initialise the engine and create tables. Returns True on success."""
    global _engine, _SessionLocal, _init_ok
    if _init_ok:
        return True
    if not settings.DATABASE_URL:
        logger.info("DATABASE_URL not set — persistence disabled.")
        return False
    try:
        _engine = create_engine(
            _normalise_url(settings.DATABASE_URL),
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"connect_timeout": 10},
        )
        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
        _init_ok = True
        logger.info("Database initialised and tables ensured.")
        return True
    except Exception as exc:  # pragma: no cover - network/startup safety
        logger.warning("Database init failed (%s); running without persistence.", exc)
        _engine = None
        _SessionLocal = None
        return False


def is_enabled() -> bool:
    return _init_ok and _SessionLocal is not None


@contextmanager
def _session() -> Iterator[Optional[Session]]:
    if not is_enabled():
        yield None
        return
    assert _SessionLocal is not None
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception as exc:  # pragma: no cover - runtime safety
        session.rollback()
        logger.warning("DB operation failed: %s", exc)
    finally:
        session.close()


def record_score_event(
    *,
    session_id: str,
    total_score: int,
    breakdown: dict,
    target_country: str = "global",
    template: str = "",
    word_count: int = 0,
) -> None:
    with _session() as s:
        if s is None:
            return
        s.add(
            ScoreEvent(
                session_id=session_id or "anonymous",
                total_score=int(total_score),
                keyword_density=int(breakdown.get("keyword_density", 0)),
                formatting=int(breakdown.get("formatting", 0)),
                quantifiable_metrics=int(breakdown.get("quantifiable_metrics", 0)),
                impact_verbs=int(breakdown.get("impact_verbs", 0)),
                structure=int(breakdown.get("structure", 0)),
                target_country=target_country or "global",
                template=template or "",
                word_count=int(word_count or 0),
            )
        )


def get_score_history(session_id: str, limit: int = 20) -> List[dict]:
    with _session() as s:
        if s is None:
            return []
        rows = (
            s.query(ScoreEvent)
            .filter(ScoreEvent.session_id == (session_id or "anonymous"))
            .order_by(ScoreEvent.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "total_score": r.total_score,
                "keyword_density": r.keyword_density,
                "formatting": r.formatting,
                "quantifiable_metrics": r.quantifiable_metrics,
                "impact_verbs": r.impact_verbs,
                "structure": r.structure,
                "target_country": r.target_country,
                "template": r.template,
                "word_count": r.word_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reversed(rows)  # chronological for charting
        ]


def record_chat_message(*, session_id: str, role: str, content: str, source: str = "") -> None:
    with _session() as s:
        if s is None:
            return
        s.add(
            ChatMessageRow(
                session_id=session_id or "anonymous",
                role=role,
                content=content,
                source=source,
            )
        )


def ping() -> bool:
    """Lightweight connectivity check used by the health endpoint."""
    if not is_enabled():
        return False
    try:
        from sqlalchemy import text

        with _session() as s:
            if s is None:
                return False
            s.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# Profile CRUD                                                                 #
# --------------------------------------------------------------------------- #
_PROFILE_FIELDS = (
    "full_name", "headline", "email", "phone", "location", "summary",
    "links", "skills", "experience", "projects", "education",
)


def _profile_to_dict(p: "Profile") -> dict:
    return {
        "full_name": p.full_name,
        "headline": p.headline,
        "email": p.email,
        "phone": p.phone,
        "location": p.location,
        "summary": p.summary,
        "links": p.links or [],
        "skills": p.skills or [],
        "experience": p.experience or [],
        "projects": p.projects or [],
        "education": p.education or [],
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def get_profile(session_id: str) -> Optional[dict]:
    with _session() as s:
        if s is None:
            return None
        p = s.query(Profile).filter(Profile.session_id == (session_id or "anonymous")).first()
        return _profile_to_dict(p) if p else None


def upsert_profile(session_id: str, data: dict) -> Optional[dict]:
    with _session() as s:
        if s is None:
            return None
        sid = session_id or "anonymous"
        p = s.query(Profile).filter(Profile.session_id == sid).first()
        if p is None:
            p = Profile(session_id=sid)
            s.add(p)
        for field in _PROFILE_FIELDS:
            if field in data and data[field] is not None:
                setattr(p, field, data[field])
        s.flush()
        return _profile_to_dict(p)


# --------------------------------------------------------------------------- #
# Application CRUD                                                             #
# --------------------------------------------------------------------------- #
def _app_to_dict(a: "Application") -> dict:
    return {
        "id": a.id,
        "company": a.company,
        "role": a.role,
        "location": a.location,
        "posting_url": a.posting_url,
        "posting_text": a.posting_text,
        "stage": a.stage,
        "match_score": a.match_score,
        "requirements": a.requirements or [],
        "gaps": a.gaps or [],
        "tailored_resume": a.tailored_resume or {},
        "cover_letter": a.cover_letter or "",
        "notes": a.notes or "",
        "sort_order": a.sort_order,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


_APP_FIELDS = (
    "company", "role", "location", "posting_url", "posting_text", "stage",
    "match_score", "requirements", "gaps", "tailored_resume", "cover_letter",
    "notes", "sort_order",
)


def list_applications(session_id: str) -> List[dict]:
    with _session() as s:
        if s is None:
            return []
        rows = (
            s.query(Application)
            .filter(Application.session_id == (session_id or "anonymous"))
            .order_by(Application.sort_order.asc(), Application.created_at.desc())
            .all()
        )
        return [_app_to_dict(a) for a in rows]


def create_application(session_id: str, data: dict) -> Optional[dict]:
    with _session() as s:
        if s is None:
            return None
        a = Application(session_id=session_id or "anonymous")
        for field in _APP_FIELDS:
            if field in data and data[field] is not None:
                setattr(a, field, data[field])
        s.add(a)
        s.flush()
        return _app_to_dict(a)


def update_application(session_id: str, app_id: int, data: dict) -> Optional[dict]:
    with _session() as s:
        if s is None:
            return None
        a = (
            s.query(Application)
            .filter(Application.id == app_id, Application.session_id == (session_id or "anonymous"))
            .first()
        )
        if a is None:
            return None
        for field in _APP_FIELDS:
            if field in data and data[field] is not None:
                setattr(a, field, data[field])
        s.flush()
        return _app_to_dict(a)


def delete_application(session_id: str, app_id: int) -> bool:
    with _session() as s:
        if s is None:
            return False
        a = (
            s.query(Application)
            .filter(Application.id == app_id, Application.session_id == (session_id or "anonymous"))
            .first()
        )
        if a is None:
            return False
        s.delete(a)
        return True


def funnel_stats(session_id: str) -> dict:
    """Counts per stage plus a simple weekly created-count series."""
    with _session() as s:
        if s is None:
            return {"stages": {st: 0 for st in STAGES}, "total": 0, "weekly": []}
        rows = (
            s.query(Application)
            .filter(Application.session_id == (session_id or "anonymous"))
            .all()
        )
        stages = {st: 0 for st in STAGES}
        weekly: dict = {}
        for a in rows:
            stages[a.stage] = stages.get(a.stage, 0) + 1
            if a.created_at:
                wk = a.created_at.strftime("%Y-W%W")
                weekly[wk] = weekly.get(wk, 0) + 1
        weekly_series = [{"week": k, "count": v} for k, v in sorted(weekly.items())]
        return {"stages": stages, "total": len(rows), "weekly": weekly_series}
