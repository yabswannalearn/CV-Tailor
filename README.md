# CV Tailor

A free, open-source CV tailoring app. Paste your profile and a job description, get back an ATS-safe, one-page resume PDF built from your real experience — plus a matching cover letter.

**Live app:** [cvtailor.me](https://cvtailor.me)

## How it works

- **AI tailoring via the ChatGPT API** — the backend sends your profile + job description to OpenAI's models, which select, rewrite, and keyword-align your bullets. Gemini is supported as a drop-in alternative provider (`AI_PROVIDER=openai|gemini`).
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
| AI | OpenAI Chat Completions API (default) · Google Gemini (switchable) |
| Database | PostgreSQL |
| PDF | Tectonic (LaTeX), pypdf-based ATS validation |

## Running locally

```bash
# 1. Backend
cd ai-service
pip install -r requirements.txt
cp .env.example .env        # set DATABASE_URL, OPENAI_API_KEY (or GEMINI_API_KEY)
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
AI_PROVIDER=openai          # or "gemini"
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...          # only needed if AI_PROVIDER=gemini
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```
