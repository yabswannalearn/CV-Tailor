# CV Tailor

A free, open-source CV tailoring app. Paste your profile and a job description, get back an ATS-safe, one-page resume PDF built from your real experience — plus a matching cover letter.

**Live app:** [cvtailor.me](https://cvtailor.me)

## How it works

- **AI-powered tailoring** — the backend sends your profile + job description to Google's Gemini models (with OpenAI as a one-line backup via `AI_PROVIDER`), which select, rewrite, and keyword-align your bullets.
- **LaTeX-quality PDFs** — the AI returns plain text only; a deterministic LaTeX assembler builds every document, so an AI rewrite can never break compilation. Compiled with Tectonic.
- **ATS Check** — every generated PDF is validated post-compile: section order, selectable text, ATS-conventional headings.
- **Spot Edit** — select any text in the PDF preview and describe a change ("make this more metric-heavy"). Only those lines are rewritten; a grounding pass blocks invented facts and numbers.
- **Roles & Presets** — pick a role (e.g. Virtual Assistant, Data Analyst) to steer summary style, skills bank, and section emphasis.
- **Application Tracker, Cover Letters, Interview Practice, Coding Practice** — all powered by the same AI layer.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (TypeScript), react-pdf preview |
| Backend | FastAPI (Python) |
| AI | Google Gemini API (default) · OpenAI Chat Completions (backup) |
| Database | PostgreSQL |
| PDF | Tectonic (LaTeX), pypdf-based ATS validation |

## Running locally

```bash
# 1. Backend
cd ai-service
pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL, GEMINI_API_KEY (or OPENAI_API_KEY)
python migration.py         # create tables
uvicorn main:app --reload

# 2. Frontend
cd frontend
npm install
npm run dev
```

## Configuration

All AI traffic goes through one dispatcher (`ai-service/services/llm_service.py`). Switch providers with env vars:

```env
AI_PROVIDER=gemini          # or "openai"
GEMINI_API_KEY=...          # required for the default provider
GEMINI_MODEL=gemini-3.1-flash-lite-preview
OPENAI_API_KEY=sk-...       # only needed if AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
```
