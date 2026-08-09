# Comprehensive Implementation Plan: 04_ai_job_scraper_and_tracker_integration

## 1. Overview & Objectives
Integrate an automated AI Job Discovery & Scoring service into **CV Tailor Go**. This feature searches remote job listings matching the candidate's saved `Profile` and `preset_slug`, scores each job fit (0–100) using the existing Gemini API (`gemini-2.5-flash`), and imports top-scoring postings directly into the PostgreSQL `JobApplication` tracker and `/generate` LaTeX resume builder.

---

## 2. Anti-Overengineering & Software Design Principles

### Core Principles Applied
- **KISS (Keep It Simple)**: Reuse existing `genai.Client` and `llm_service.py` functions instead of adding new LLM dependencies or complex agent frameworks.
- **DRY (Don't Repeat Yourself)**: Reuse `db_profile_to_schema()` to serialize candidate profile skills and experience without duplicating database query logic.
- **YAGNI (You Aren't Gonna Need It)**: Do not use heavy headless browser automation (Playwright/Selenium). Use lightweight asynchronous HTTP requests (`httpx`) to fetch clean job posting payloads from job APIs/feeds.
- **Separation of Concerns**:
  - **Fetcher Layer**: Pure HTTP fetching logic (`job_scraper_service.py`).
  - **Evaluator Layer**: Pure AI matching & reasoning logic (`job_evaluator_service.py`).
  - **API Router**: Route execution, session auth, and DB transaction management (`scraper_routes.py`).
  - **UI Layer**: Pure React presentation components (`DiscoverJobsModal.tsx`, `JobMatchCard.tsx`, `JobMatchScoreBadge.tsx`).

---

## 3. Detailed Architecture & Technical Solutions

### A. Component Hierarchy & File Structure

```
ai-service/
├── models/
│   └── database_models.py                # Updated JobApplication with match_score & match_analysis
├── services/
│   ├── job_scraper_service.py            # HTTP client fetching raw job postings
│   └── job_evaluator_service.py          # Gemini AI evaluation service (fit score, pros/cons)
├── routers/
│   └── scraper_routes.py                 # FastAPI router (/scraper/discover, /scraper/import)
└── migration.py                          # DB migration adding match fields

frontend/src/
├── components/
│   └── tracker/
│       ├── DiscoverJobsModal.tsx         # Modal dialog for job search & result display
│       ├── JobMatchCard.tsx              # Reusable card component for single job match
│       └── JobMatchScoreBadge.tsx        # Reusable visual badge component for 0-100 score
├── services/
│   └── scraperApi.ts                     # Frontend API client for /scraper endpoints
└── app/
    └── tracker/
        └── page.tsx                      # Main Job Tracker page (Discover trigger integrated)
```

---

### B. State Machine & Flow Diagram

```
 [ User clicks "Discover Jobs" on /tracker ]
                    │
                    ▼
       Open DiscoverJobsModal
                    │
                    ▼
       GET /scraper/discover?keyword=...
        ├── 1. Read User Profile & Skills from DB
        ├── 2. Fetch raw job postings via HTTP (httpx)
        ├── 3. Evaluate job match via Gemini 2.5 Flash
        └── 4. Return sorted array of JobMatch objects
                    │
                    ▼
     Render JobMatchCard list with JobMatchScoreBadge
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
[ Save to Tracker ]     [ Save & Tailor Resume ]
       │                         │
       POST /scraper/import      POST /scraper/import
       │                         │
       Refresh Tracker List      Redirect to /generate?job_id={id}
```

---

### C. Technical Specifications & Code Contracts

#### Solution 1: Database Migration & Model Update
Add non-breaking optional fields to `JobApplication` in [`ai-service/models/database_models.py`](file:///C:/vscode/Personal/CV%20Tailor%20Go/ai-service/models/database_models.py):

```python
# database_models.py
class JobApplication(Base):
    # ... existing fields ...
    match_score = Column(Integer, nullable=True)          # 0-100 score
    match_analysis = Column(JSON, nullable=True)          # {"pros": [...], "cons": [...], "summary": "..."}
```

#### Solution 2: AI Evaluator Service (`job_evaluator_service.py`)
Uses existing Gemini Flash client to evaluate job fit safely with schema fallback:

```python
# ai-service/services/job_evaluator_service.py
import json
import os
from google import genai
from models import database_models as db_models
from services.llm_service import db_profile_to_schema

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

async def evaluate_job_match(profile: db_models.Profile, job_title: str, company: str, description: str) -> dict:
    user_schema = db_profile_to_schema(profile)
    skills_list = [s.skill_name for s in user_schema.skills]
    exp_list = [f"{e.job_title} at {e.company}" for e in user_schema.experience]
    
    prompt = f"""
    Evaluate candidate fit for this job posting.
    Candidate Skills: {skills_list}
    Candidate Experience: {exp_list}
    
    Job Title: {job_title}
    Company: {company}
    Job Description: {description[:3000]}
    
    Return JSON format:
    {{
      "score": 85,
      "summary": "Strong match for frontend stack and experience level.",
      "pros": ["Matches React/Next.js requirement", "Matches experience level"],
      "cons": ["Requires GraphQL experience not explicitly listed"]
    }}
    """
    try:
        res = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"}
        )
        return json.loads(res.text)
    except Exception:
        return {"score": 50, "summary": "Automated match score unavailable", "pros": [], "cons": []}
```

#### Solution 3: Reusable UI Component (`JobMatchScoreBadge.tsx`)
Single-responsibility visual badge for rendering match scores consistently across the application:

```tsx
// frontend/src/components/tracker/JobMatchScoreBadge.tsx
import React from 'react';

interface JobMatchScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export const JobMatchScoreBadge: React.FC<JobMatchScoreBadgeProps> = ({ score, size = 'md' }) => {
  const getBadgeStyle = (val: number) => {
    if (val >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (val >= 60) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${getBadgeStyle(score)} ${sizeClasses}`}>
      {score}% Match
    </span>
  );
};
```

---

## 4. Step-by-Step Implementation Roadmap

### Step 1: Database Schema Migration
- Update [`ai-service/models/database_models.py`](file:///C:/vscode/Personal/CV%20Tailor%20Go/ai-service/models/database_models.py) to include `match_score` and `match_analysis`.
- Add column creation statements to [`ai-service/migration.py`](file:///C:/vscode/Personal/CV%20Tailor%20Go/ai-service/migration.py).

### Step 2: Implement Backend Scraper & Evaluator Services
- Create `ai-service/services/job_scraper_service.py` to handle HTTP API calls to public job feeds (e.g., RemoteOK JSON API).
- Create `ai-service/services/job_evaluator_service.py` to run Gemini evaluations.

### Step 3: Implement FastAPI Router & Register Endpoints
- Create `ai-service/routers/scraper_routes.py` containing `GET /scraper/discover` and `POST /scraper/import`.
- Mount router in [`ai-service/main.py`](file:///C:/vscode/Personal/CV%20Tailor%20Go/ai-service/main.py).

### Step 4: Build Reusable Frontend Components
- Create `JobMatchScoreBadge.tsx`, `JobMatchCard.tsx`, and `DiscoverJobsModal.tsx` in `frontend/src/components/tracker/`.
- Create `frontend/src/services/scraperApi.ts` API wrapper.

### Step 5: Integrate into Tracker Page
- Add "Discover Jobs with AI" button on [`frontend/src/app/tracker/page.tsx`](file:///C:/vscode/Personal/CV%20Tailor%20Go/frontend/src/app/tracker/page.tsx).
- Connect import callback to refresh tracker table and support instant navigation to `/generate`.

---

## 5. Verification & Testing Plan

1. **Backend Service Verification**:
   - Verify `GET /scraper/discover` returns valid scored job JSON objects within 3 seconds.
   - Verify failure fallback returns default score without throwing 500 exceptions.
2. **Database Integrity Verification**:
   - Verify `POST /scraper/import` correctly creates a row in `job_applications` with `user_id`, `match_score`, and `match_analysis`.
3. **UI & UX Validation**:
   - Verify `JobMatchScoreBadge` renders green for >=80%, yellow for 60-79%, red for <60%.
   - Verify "Save & Tailor" imports job and redirects smoothly to `/generate`.
