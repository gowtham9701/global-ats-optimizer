"""Application configuration loaded from environment variables.

All AI providers are optional. When no provider is configured the app
gracefully falls back to a deterministic heuristic engine so the project
runs with zero setup and zero cost.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> List[str]:
    # Normalise origins: trim whitespace and drop any trailing slash so a value
    # like "https://app.vercel.app/" still matches the browser Origin header
    # ("https://app.vercel.app"), which never includes a trailing slash.
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


class Settings:
    """Central settings object."""

    APP_NAME: str = "CareerForge — Career & Application Suite"
    APP_VERSION: str = "2.0.0"

    # LLM provider: "openrouter", "gemini", "ollama", or "heuristic" (no external model).
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "heuristic").lower()

    # OpenRouter (unified OpenAI-compatible API, many free models).
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_BASE_URL: str = os.getenv(
        "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
    )
    OPENROUTER_MODEL: str = os.getenv(
        "OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"
    )
    # Ordered fallbacks tried when the primary model errors or is rate-limited.
    OPENROUTER_FALLBACK_MODELS: List[str] = _split_csv(
        os.getenv("OPENROUTER_FALLBACK_MODELS", "")
    )
    OPENROUTER_SITE_URL: str = os.getenv("OPENROUTER_SITE_URL", "http://localhost:5173")
    OPENROUTER_APP_NAME: str = os.getenv("OPENROUTER_APP_NAME", "Global ATS Optimizer")

    # Google Gemini (free tier).
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    # Leave empty to auto-select the newest usable flash model for the key.
    # Set explicitly (e.g. "gemini-3.8-flash") to force a specific model.
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "")

    # Ollama local models (fully open-source, zero cost).
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")

    # Neon / Postgres database (optional). When unset the app runs without
    # persistence; when set, score history and chat sessions are stored.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # Embeddings for RAG. "tfidf" is pure-python-friendly and deployment safe.
    EMBEDDINGS_BACKEND: str = os.getenv("EMBEDDINGS_BACKEND", "tfidf").lower()
    SENTENCE_TRANSFORMER_MODEL: str = os.getenv(
        "SENTENCE_TRANSFORMER_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )

    # CORS origins for the frontend (comma separated).
    CORS_ORIGINS: List[str] = _split_csv(
        os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    )

    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "10"))

    @property
    def llm_enabled(self) -> bool:
        if self.LLM_PROVIDER == "openrouter":
            return bool(self.OPENROUTER_API_KEY)
        if self.LLM_PROVIDER == "gemini":
            return bool(self.GEMINI_API_KEY)
        if self.LLM_PROVIDER == "ollama":
            return True
        return False

    @property
    def db_enabled(self) -> bool:
        return bool(self.DATABASE_URL)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
