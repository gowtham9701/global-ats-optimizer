# 🌍 Global ATS Resume Optimizer & Agentic Architect

A **self-hosted, open-source, zero-cost** full-stack application that turns any resume into
an ATS-optimized, country-localized, beautifully re-rendered PDF — powered by an **agentic
AI workflow** with **RAG** grounding.

Built to run **100% free**: it works out-of-the-box with a deterministic heuristic engine
(no API keys, no models), and can be upgraded to **Google Gemini (free tier)** or
**Ollama (local Llama 3 / Mistral)** for richer AI narratives — all with zero API cost.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Multi-Country Converter** | Reshape a dense Indian-style resume into a clean, anonymised German *Lebenslauf* (or US/UK/Canada) with the correct structural sequencing and privacy stripping. |
| **Resume Creator** | Build a resume three ways — **generate from a plain-text prompt/description**, **import a PDF/DOCX**, or **start blank** — then edit everything live in the UI. |
| **Live In-UI Editor** | Edit contact fields and every section/bullet directly; edits instantly become the "latest result" re-fed into the scoring model. Live preview + **Download PDF pinned to the top toolbar**. |
| **ATS Verification Everywhere** | A reusable **Verify ATS Score** control appears throughout the flow (Home, Builder toolbar, Dashboard) so compatibility is checked at every step. |
| **ATS Scoring & Deep Diagnostics** | A benchmark score **/100** from 5 weighted components: keyword density, formatting, quantifiable metrics, impact verbs, structure. |
| **Key Line Highlighter** | Color-codes every line 🟢 high-impact / 🟡 needs-metrics / 🔴 weak-phrasing, with inline replacement suggestions. |
| **Agentic AI Tools** | An agent orchestrates custom tools: **Keyword Matcher**, **Action-Verb Enhancer**, **Formatter**, **Line Profiler**, **Structural Localizer**. |
| **RAG Knowledge Base** | Country-specific ATS best-practices retrieved (TF-IDF or sentence-transformers) and injected into the agent prompts. |
| **Template Engine** | Upload PDF/DOCX → parse semantic layout → pick **Tech Minimalist / Executive / Academic** → download a re-rendered PDF. |
| **Creative UI** | React + Tailwind + Framer Motion: animated score dials, drag-and-drop upload, split-screen original-vs-enhanced, template grid. |

---

## 🧱 Architecture

```
global-ats-optimizer/
├── backend/                      # FastAPI + agentic AI + RAG + PDF
│   ├── app/
│   │   ├── main.py               # API: /upload /analyze /localize /generate-pdf
│   │   ├── config.py             # env-driven settings (provider fallback)
│   │   ├── models/schemas.py     # Pydantic models
│   │   ├── services/
│   │   │   ├── parser.py         # PDF/DOCX → semantic resume (pdfplumber/python-docx)
│   │   │   ├── ats_scorer.py     # deterministic scoring + line profiling
│   │   │   ├── rag.py            # TF-IDF / sentence-transformers retrieval
│   │   │   ├── localization.py   # country conversion + privacy stripping
│   │   │   ├── resume_builder.py # generate a resume from a prompt (LLM + heuristic)
│   │   │   ├── llm_provider.py   # Gemini / Ollama / heuristic abstraction
│   │   │   └── pdf_generator.py  # Jinja2 HTML → PDF (xhtml2pdf / WeasyPrint)
│   │   ├── agents/
│   │   │   ├── tools.py          # custom agent tools
│   │   │   └── optimizer_agent.py# agent orchestration loop
│   │   ├── templates/            # 3 resume HTML templates
│   │   └── knowledge/            # RAG knowledge base (JSON)
│   ├── requirements.txt
│   ├── render.yaml / Procfile    # Render deploy
│   └── .env.example
└── frontend/                     # React (Vite) + Tailwind + Framer Motion
    ├── src/
    │   ├── pages/                # Home, Builder (creator + live editor), Dashboard
    │   ├── components/           # Dropzone, ScoreDial, TemplateGrid, LineHighlighter, SplitScreen, ResumeEditor, AtsScore…
    │   ├── store/                # shared React context + parsed<->text utils
    │   └── api/client.js         # axios API client
    ├── vercel.json               # Vercel deploy
    └── .env.example
```

---

## 🚀 Quick Start (Local)

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # defaults to zero-cost heuristic mode
uvicorn app.main:app --reload --port 8000
```

API docs at **http://localhost:8000/docs**

### 2. Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env               # leave VITE_API_BASE empty for local proxy
npm run dev
```

App at **http://localhost:5173**

---

## 🤖 Enabling Real AI (optional, still free)

The app runs fully without any model. To enable richer AI narratives/rewrites:

### Option A — Google Gemini (free tier)
1. Get a free key: https://aistudio.google.com/app/apikey
2. In `backend/.env`:
   ```
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your_key_here
   ```
3. `pip install google-generativeai` (uncomment in requirements.txt)

### Option B — Ollama (local open-source models)
1. Install Ollama: https://ollama.com
2. `ollama pull llama3`
3. In `backend/.env`:
   ```
   LLM_PROVIDER=ollama
   OLLAMA_MODEL=llama3
   ```

### Higher-quality RAG (optional)
```
EMBEDDINGS_BACKEND=sentence-transformers
```
(`pip install sentence-transformers` — heavier, best for local use.)

---

## ☁️ Deployment

### Backend → Render (free)
- Push this repo to GitHub.
- On Render: **New → Blueprint**, pick the repo (it reads `backend/render.yaml`), or create a
  **Web Service** with root `backend/`, build `pip install -r requirements.txt`,
  start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Set env vars (e.g. `CORS_ORIGINS` = your Vercel URL, optional `GEMINI_API_KEY`).

### Frontend → Vercel (free)
- On Vercel: **New Project**, root directory `frontend/`.
- Add env var `VITE_API_BASE` = your Render backend URL (e.g. `https://xxx.onrender.com`).
- Deploy. `vercel.json` handles the SPA rewrites.

> The backend CORS config already allows any `*.vercel.app` origin plus whatever you set in `CORS_ORIGINS`.

---

## 🔌 API Reference

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/upload` | Parse an uploaded PDF/DOCX/TXT into a semantic resume |
| `POST` | `/api/generate-resume` | Create a structured resume from a free-text prompt/description |
| `POST` | `/api/analyze` | Run the agentic ATS analysis (score, highlights, keywords, RAG) |
| `POST` | `/api/localize` | Convert a resume to another country's conventions |
| `POST` | `/api/generate-pdf` | Render a parsed resume to a styled PDF |
| `GET`  | `/api/templates` | List available templates |
| `GET`  | `/api/tools` | List registered agent tools |
| `GET`  | `/api/health` | Liveness probe |

---

## 🧪 Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion, react-dropzone, axios
- **Backend:** FastAPI, Uvicorn, Pydantic
- **Parsing:** pdfplumber, python-docx
- **PDF:** xhtml2pdf (pure-python) / WeasyPrint (optional)
- **AI:** Gemini / Ollama / heuristic fallback · LangChain-ready tool layer
- **RAG:** scikit-learn TF-IDF / sentence-transformers

---

## 📄 License

MIT — free to use, modify and deploy.
