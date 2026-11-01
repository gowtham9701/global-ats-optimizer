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
import re
from typing import Iterator, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider:
    """Thin wrapper over the configured text-generation backend."""

    def __init__(self) -> None:
        self.provider = settings.LLM_PROVIDER
        self._gemini_model = None
        self._model_name = settings.GEMINI_MODEL
        if self.provider == "openrouter":
            if settings.OPENROUTER_API_KEY:
                self._model_name = settings.OPENROUTER_MODEL
                logger.info("OpenRouter provider initialised with model %s", self._model_name)
            else:
                logger.warning("LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is empty; using heuristic.")
                self.provider = "heuristic"
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

        Google retires older models and increasingly restricts **new** API keys
        to only the newest models (e.g. a new key may list ``gemini-2.5-flash``
        yet get a 404 "no longer available to new users", being pushed to the
        latest ``gemini-3.x-flash``). To stay usable across these changes we pick
        the **newest** plain text ``gemini-X.Y-flash[-lite]`` model available to
        the key, skipping ``*-latest`` aliases and specialty variants
        (image/tts/robotics/etc). An explicit ``GEMINI_MODEL`` always wins.
        """
        skip = ("latest", "preview", "tts", "image", "robotics", "lyria",
                "nano", "deep-research", "antigravity", "computer-use",
                "gemma", "transcribe", "omni", "argon")
        plain_flash = re.compile(r"^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$")
        try:
            available = []
            for m in genai.list_models():
                methods = getattr(m, "supported_generation_methods", []) or []
                if "generateContent" in methods:
                    available.append(m.name.split("/", 1)[-1])
            if not available:
                return configured
            # An explicit, available configured model always wins.
            if configured and configured in available:
                return configured
            # Rank plain flash models: newest version first; at the same
            # version prefer the "-lite" variant (higher free-tier throughput).
            ranked = []
            for a in available:
                mm = plain_flash.match(a)
                if mm:
                    ranked.append((float(mm.group(1)), bool(mm.group(2)), a))
            if ranked:
                ranked.sort(key=lambda x: (x[0], x[1]), reverse=True)
                return ranked[0][2]
            # Fallback: any non-specialty flash, else the first available model.
            safe = [a for a in available if "flash" in a and not any(s in a for s in skip)]
            return (safe or available)[0]
        except Exception as exc:  # pragma: no cover - network/listing safety
            logger.warning("Gemini model listing failed (%s); using configured '%s'.", exc, configured)
            return configured

    @property
    def is_live(self) -> bool:
        """True when a real model (not the heuristic) is available."""
        if self.provider == "openrouter":
            return bool(settings.OPENROUTER_API_KEY)
        if self.provider == "gemini":
            return self._gemini_model is not None
        if self.provider == "ollama":
            return True
        return False

    def generate(self, prompt: str, *, system: Optional[str] = None, temperature: float = 0.3) -> str:
        """Generate text, never raising; returns "" if nothing is available."""
        try:
            if self.provider == "openrouter" and settings.OPENROUTER_API_KEY:
                return self._generate_openrouter(prompt, system, temperature)
            if self.provider == "gemini" and self._gemini_model is not None:
                return self._generate_gemini(prompt, system, temperature)
            if self.provider == "ollama":
                return self._generate_ollama(prompt, system, temperature)
        except Exception as exc:  # pragma: no cover - network/runtime safety
            logger.warning("LLM generation failed (%s); using heuristic.", exc)
        return ""

    # ------------------------------------------------------------------ #
    # OpenRouter (OpenAI-compatible chat completions)                    #
    # ------------------------------------------------------------------ #
    def _openrouter_models(self) -> List[str]:
        models = [settings.OPENROUTER_MODEL] + list(settings.OPENROUTER_FALLBACK_MODELS)
        # Preserve order, drop duplicates/empties.
        seen: set = set()
        ordered: List[str] = []
        for m in models:
            m = (m or "").strip()
            if m and m not in seen:
                seen.add(m)
                ordered.append(m)
        return ordered

    def _openrouter_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": settings.OPENROUTER_APP_NAME,
        }

    def _openrouter_messages(self, prompt: str, system: Optional[str]) -> list:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _generate_openrouter(self, prompt: str, system: Optional[str], temperature: float) -> str:
        messages = self._openrouter_messages(prompt, system)
        return self.chat_openrouter(messages, temperature=temperature)

    def chat_openrouter(self, messages: list, *, temperature: float = 0.4) -> str:
        """Non-streaming chat completion with retry + automatic model fallback."""
        import time

        last_err: Optional[str] = None
        with httpx.Client(timeout=120) as client:
            for model in self._openrouter_models():
                for attempt in range(2):  # one retry on transient rate-limits
                    try:
                        resp = client.post(
                            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                            headers=self._openrouter_headers(),
                            json={
                                "model": model,
                                "messages": messages,
                                "temperature": temperature,
                                "max_tokens": 4096,
                            },
                        )
                        if resp.status_code == 429 and attempt == 0:
                            last_err = f"{model}: HTTP 429 (rate limited), retrying"
                            logger.warning("OpenRouter %s", last_err)
                            time.sleep(1.5)
                            continue
                        if resp.status_code != 200:
                            last_err = f"{model}: HTTP {resp.status_code} {resp.text[:160]}"
                            logger.warning("OpenRouter %s", last_err)
                            break
                        data = resp.json()
                        text = self._extract_openrouter_text(data)
                        if text:
                            self._model_name = model
                            return text
                        last_err = f"{model}: empty response"
                        break
                    except Exception as exc:  # pragma: no cover - network safety
                        last_err = f"{model}: {exc}"
                        logger.warning("OpenRouter error %s", last_err)
                        break
        logger.warning("All OpenRouter models failed: %s", last_err)
        return ""

    def stream_openrouter(self, messages: list, *, temperature: float = 0.4) -> Iterator[str]:
        """Yield text chunks as they arrive (SSE). Falls back across models."""
        for model in self._openrouter_models():
            produced = False
            try:
                with httpx.Client(timeout=180) as client:
                    with client.stream(
                        "POST",
                        f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                        headers=self._openrouter_headers(),
                        json={
                            "model": model,
                            "messages": messages,
                            "temperature": temperature,
                            "max_tokens": 4096,
                            "stream": True,
                        },
                    ) as resp:
                        if resp.status_code != 200:
                            body = resp.read().decode("utf-8", "ignore")[:160]
                            logger.warning("OpenRouter stream %s HTTP %s %s", model, resp.status_code, body)
                            continue
                        self._model_name = model
                        for line in resp.iter_lines():
                            if not line:
                                continue
                            if line.startswith("data: "):
                                line = line[6:]
                            if line.strip() == "[DONE]":
                                break
                            try:
                                chunk = json.loads(line)
                            except (ValueError, json.JSONDecodeError):
                                continue
                            delta = (
                                chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                                or ""
                            )
                            if delta:
                                produced = True
                                yield delta
                if produced:
                    return
            except Exception as exc:  # pragma: no cover - network safety
                logger.warning("OpenRouter stream error %s: %s", model, exc)
                continue
        # Nothing streamed from any model.
        return

    @staticmethod
    def _extract_openrouter_text(data: dict) -> str:
        try:
            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            text = (msg.get("content") or "").strip()
            if text:
                return text
            # Some reasoning models place the answer in "reasoning".
            return (msg.get("reasoning") or "").strip()
        except Exception:
            return ""

    def _generate_gemini(self, prompt: str, system: Optional[str], temperature: float) -> str:
        full = prompt if not system else f"{system}\n\n{prompt}"
        response = self._gemini_model.generate_content(
            full,
            generation_config={"temperature": temperature, "max_output_tokens": 2048},
        )
        return self._extract_text(response)

    @staticmethod
    def _extract_text(response) -> str:
        """Safely pull text from a Gemini response.

        The ``response.text`` quick accessor raises on multi-part, blocked, or
        "thinking" model responses, so we fall back to concatenating the text
        parts of the first candidate.
        """
        try:
            txt = response.text
            if txt:
                return txt.strip()
        except Exception:
            pass
        try:
            out = []
            for cand in getattr(response, "candidates", []) or []:
                content = getattr(cand, "content", None)
                for part in getattr(content, "parts", []) or []:
                    piece = getattr(part, "text", "") or ""
                    if piece:
                        out.append(piece)
            return "".join(out).strip()
        except Exception:
            return ""

    def diagnose(self, *, test_generate: bool = True) -> dict:
        """Return diagnostics for the configured provider (safe to expose).

        Lists the models available to the key (no quota cost) and optionally
        attempts a tiny generation, reporting the result, finish reason, or the
        exact error — without ever revealing the API key.
        """
        info = {
            "provider": self.provider,
            "is_live": self.is_live,
            "model": getattr(self, "_model_name", None),
        }
        if self.provider == "openrouter" and settings.OPENROUTER_API_KEY:
            info["models"] = self._openrouter_models()
            if test_generate:
                out = self.chat_openrouter(
                    [{"role": "user", "content": "Reply with exactly: OK"}], temperature=0
                )
                info["raw_text"] = out
                info["active_model"] = self._model_name
            return info
        if self.provider == "gemini" and self._gemini_model is not None:
            try:
                import google.generativeai as genai

                info["available_models"] = [
                    m.name.split("/", 1)[-1]
                    for m in genai.list_models()
                    if "generateContent" in (getattr(m, "supported_generation_methods", []) or [])
                ]
            except Exception as exc:
                info["list_error"] = f"{type(exc).__name__}: {exc}"
            if test_generate:
                try:
                    resp = self._gemini_model.generate_content(
                        "Reply with exactly: OK",
                        generation_config={"temperature": 0, "max_output_tokens": 100},
                    )
                    info["raw_text"] = self._extract_text(resp)
                    try:
                        info["finish_reason"] = str(resp.candidates[0].finish_reason)
                    except Exception:
                        pass
                except Exception as exc:
                    info["error"] = f"{type(exc).__name__}: {exc}"
        return info

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
        """Generate and parse a JSON object. Returns None on failure.

        Robust to markdown fences, leading prose, and **truncated** output from
        token-limited free models (it attempts to repair an unterminated object
        by closing open strings/brackets).
        """
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
        except ValueError:
            return None
        candidate = raw[start:]
        # First try the straightforward slice between the first { and last }.
        try:
            end = candidate.rindex("}") + 1
            return json.loads(candidate[:end])
        except (ValueError, json.JSONDecodeError):
            pass
        # Salvage a truncated object by balancing brackets / closing strings.
        repaired = _repair_json(candidate)
        if repaired is not None:
            try:
                return json.loads(repaired)
            except (ValueError, json.JSONDecodeError):
                return None
        return None


def _repair_json(text: str) -> Optional[str]:
    """Best-effort repair of a truncated JSON object string."""
    out = []
    stack = []
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
        elif ch in "{[":
            stack.append(ch)
            out.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
            out.append(ch)
        else:
            out.append(ch)
    if in_string:
        out.append('"')
    # Drop any trailing comma before closing.
    s = "".join(out).rstrip()
    s = s.rstrip(",")
    for opener in reversed(stack):
        s += "}" if opener == "{" else "]"
    return s


_provider: Optional[LLMProvider] = None


def get_llm() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = LLMProvider()
    return _provider
