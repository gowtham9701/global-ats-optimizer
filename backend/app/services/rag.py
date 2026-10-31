"""Retrieval-Augmented Generation (RAG) over an ATS best-practices knowledge base.

Two backends:

* ``tfidf`` (default) - scikit-learn TF-IDF + cosine similarity. Pure Python
  wheels, tiny memory footprint, works on free hosting tiers.
* ``sentence-transformers`` - optional dense embeddings for higher quality
  retrieval when the heavier dependency is installed.

The retriever is loaded once and cached. Context snippets are injected into
the agent prompts to ground optimization advice in curated knowledge.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent / "knowledge" / "ats_knowledge.json"


class KnowledgeBase:
    def __init__(self) -> None:
        self.docs: List[dict] = self._load()
        self.texts: List[str] = [d["text"] for d in self.docs]
        self.backend = settings.EMBEDDINGS_BACKEND
        self._vectorizer = None
        self._matrix = None
        self._st_model = None
        self._st_embeddings = None
        self._init_backend()

    def _load(self) -> List[dict]:
        try:
            return json.loads(KNOWLEDGE_PATH.read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to load knowledge base: %s", exc)
            return []

    def _init_backend(self) -> None:
        if not self.texts:
            return
        if self.backend == "sentence-transformers":
            try:
                from sentence_transformers import SentenceTransformer

                self._st_model = SentenceTransformer(settings.SENTENCE_TRANSFORMER_MODEL)
                self._st_embeddings = self._st_model.encode(self.texts, normalize_embeddings=True)
                logger.info("RAG using sentence-transformers.")
                return
            except Exception as exc:  # pragma: no cover
                logger.warning("sentence-transformers unavailable (%s); using TF-IDF.", exc)
                self.backend = "tfidf"

        # Default: TF-IDF.
        from sklearn.feature_extraction.text import TfidfVectorizer

        self._vectorizer = TfidfVectorizer(stop_words="english")
        self._matrix = self._vectorizer.fit_transform(self.texts)
        logger.info("RAG using TF-IDF.")

    def retrieve(self, query: str, *, country: str = "global", k: int = 4) -> List[str]:
        """Return the top-k most relevant knowledge snippets for a query."""
        if not self.texts:
            return []

        # Bias the query toward country-specific documents.
        country = (country or "global").lower()
        boosted_query = f"{query} {country}"

        scores: List[float]
        if self.backend == "sentence-transformers" and self._st_model is not None:
            import numpy as np

            q = self._st_model.encode([boosted_query], normalize_embeddings=True)[0]
            scores = (self._st_embeddings @ q).tolist()
        else:
            from sklearn.metrics.pairwise import cosine_similarity

            q_vec = self._vectorizer.transform([boosted_query])
            scores = cosine_similarity(q_vec, self._matrix)[0].tolist()

        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)

        # Prioritise exact country matches, then fill with highest scoring.
        country_idx = [i for i in ranked if self.docs[i].get("country") == country]
        global_idx = [i for i in ranked if i not in country_idx]
        ordered = country_idx + global_idx
        return [self.texts[i] for i in ordered[:k]]


_kb: Optional[KnowledgeBase] = None


def get_knowledge_base() -> KnowledgeBase:
    global _kb
    if _kb is None:
        _kb = KnowledgeBase()
    return _kb
