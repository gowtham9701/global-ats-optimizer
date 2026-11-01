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
