"""LLM provider abstraction.

Supports three backends selected via the ``LLM_PROVIDER`` env var:

* ``gemini``    - Google Gemini free tier (requires ``GEMINI_API_KEY``).
* ``ollama``    - Local open-source models (Llama 3 / Mistral) via Ollama.
* ``heuristic`` - No external model. Deterministic text generation so the
                  whole application still works offline with zero cost.

Every public method degrades gracefully: if the configured provider fails
for any reason we fall back to the heuristic implementation instead of
raising, keeping the API responsive.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider:
    """Thin wrapper over the configured text-generation backend."""

    def __init__(self) -> None:
        self.provider = settings.LLM_PROVIDER
        self._gemini_model = None
        self._model_name = settings.GEMINI_MODEL
        if self.provider == "gemini" and settings.GEMINI_API_KEY:
            self._init_gemini()

    def _init_gemini(self) -> None:
        try:
            import google.generativeai as genai

            genai.configure(api_key=settings.GEMINI_API_KEY)
            model_name = self._select_model(genai, settings.GEMINI_MODEL)
            self._gemini_model = genai.GenerativeModel(model_name)
            self._model_name = model_name
            logger.info("Gemini provider initialised with model %s", model_name)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to init Gemini, falling back to heuristic: %s", exc)
            self._gemini_model = None
            self.provider = "heuristic"

    @staticmethod
    def _select_model(genai, configured: str) -> str:
        """Pick a usable Gemini model for this API key.

        Older models (e.g. gemini-1.5-flash) get retired over time, which makes
        a hardcoded name 404. We query the models available to the key and pick
        the best match by preference, so the app self-heals across deprecations.
        Falls back to the configured name if listing is unavailable.
        """
        preference = [
            configured,
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-flash-latest",
            "gemini-2.5-pro",
        ]
        try:
            available = []
            for m in genai.list_models():
                methods = getattr(m, "supported_generation_methods", []) or []
                if "generateContent" in methods:
                    # Names come back like "models/gemini-2.0-flash".
                    available.append(m.name.split("/", 1)[-1])
            if not available:
                return configured
            # Honour the preference order first.
            for want in preference:
                if want and want in available:
                    return want
            # Otherwise prefer any available "flash" model (cheapest/free-tier).
            flash = [a for a in available if "flash" in a and "latest" not in a]
            return (flash or available)[0]
        except Exception as exc:  # pragma: no cover - network/listing safety
            logger.warning("Gemini model listing failed (%s); using configured '%s'.", exc, configured)
            return configured

    @property
    def is_live(self) -> bool:
        """True when a real model (not the heuristic) is available."""
        if self.provider == "gemini":
            return self._gemini_model is not None
        if self.provider == "ollama":
            return True
        return False

    def generate(self, prompt: str, *, system: Optional[str] = None, temperature: float = 0.3) -> str:
        """Generate text, never raising; returns "" if nothing is available."""
        try:
            if self.provider == "gemini" and self._gemini_model is not None:
                return self._generate_gemini(prompt, system, temperature)
            if self.provider == "ollama":
                return self._generate_ollama(prompt, system, temperature)
        except Exception as exc:  # pragma: no cover - network/runtime safety
            logger.warning("LLM generation failed (%s); using heuristic.", exc)
        return ""

    def _generate_gemini(self, prompt: str, system: Optional[str], temperature: float) -> str:
        full = prompt if not system else f"{system}\n\n{prompt}"
        response = self._gemini_model.generate_content(
            full,
            generation_config={"temperature": temperature},
        )
        return (response.text or "").strip()

    def _generate_ollama(self, prompt: str, system: Optional[str], temperature: float) -> str:
        payload = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "system": system or "",
            "stream": False,
            "options": {"temperature": temperature},
        }
        with httpx.Client(timeout=120) as client:
            resp = client.post(f"{settings.OLLAMA_BASE_URL}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return (data.get("response") or "").strip()

    def generate_json(self, prompt: str, *, system: Optional[str] = None) -> Optional[dict]:
        """Generate and parse a JSON object. Returns None on failure."""
        raw = self.generate(prompt, system=system, temperature=0.1)
        if not raw:
            return None
        raw = raw.strip()
        # Strip common markdown code fences.
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1] if "```" in raw[3:] else raw.strip("`")
            raw = raw.lstrip("json").strip()
        try:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            return json.loads(raw[start:end])
        except (ValueError, json.JSONDecodeError):
            return None


_provider: Optional[LLMProvider] = None


def get_llm() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = LLMProvider()
    return _provider
