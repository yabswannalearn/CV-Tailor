# Graph Report - C:\vscode\Personal\CV Tailor Go  (2026-06-23)

## Corpus Check
- Corpus is ~27,679 words - fits in a single context window. You may not need a graph.

## Summary
- 324 nodes · 554 edges · 31 communities (23 shown, 8 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth & API Schemas|Auth & API Schemas]]
- [[_COMMUNITY_Database & Backend Core|Database & Backend Core]]
- [[_COMMUNITY_Job Application Tracker|Job Application Tracker]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Code Practice Routes|Code Practice Routes]]
- [[_COMMUNITY_Tracker UI Page|Tracker UI Page]]
- [[_COMMUNITY_Generate Routes|Generate Routes]]
- [[_COMMUNITY_LLM Service|LLM Service]]
- [[_COMMUNITY_Interview Page UI|Interview Page UI]]
- [[_COMMUNITY_Code Practice UI|Code Practice UI]]
- [[_COMMUNITY_Interview Routes|Interview Routes]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_Generate Page UI|Generate Page UI]]
- [[_COMMUNITY_Database Models|Database Models]]
- [[_COMMUNITY_Sidebar Navigation|Sidebar Navigation]]
- [[_COMMUNITY_Database Routes|Database Routes]]
- [[_COMMUNITY_MediaPipe Types|MediaPipe Types]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_UI Icons|UI Icons]]
- [[_COMMUNITY_Agent Config|Agent Config]]
- [[_COMMUNITY_PDF Service|PDF Service]]
- [[_COMMUNITY_Brand Icons|Brand Icons]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Request` - 14 edges
3. `Request` - 13 edges
4. `Session` - 13 edges
5. `PDFCompilationError` - 13 edges
6. `FastAPI` - 12 edges
7. `get_current_user_id()` - 12 edges
8. `UserProfile` - 12 edges
9. `db_profile_to_schema()` - 10 edges
10. `require_auth()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `FastAPI` --semantically_similar_to--> `Next.js Project`  [INFERRED] [semantically similar]
  ai-service/main.py → frontend/README.md
- `Backend Smoke Test Job` --calls--> `FastAPI`  [EXTRACTED]
  .github/workflows/backend-ci.yml → ai-service/main.py
- `FastAPI Cloud Configuration` --conceptually_related_to--> `FastAPI`  [INFERRED]
  ai-service/.fastapicloud/README.md → ai-service/main.py
- `Request` --uses--> `UserProfile`  [INFERRED]
  ai-service/routers/database_routes.py → ai-service/models/schemas.py
- `UserProfile` --uses--> `UserProfile`  [INFERRED]
  ai-service/routers/database_routes.py → ai-service/models/schemas.py

## Import Cycles
- 1-file cycle: `ai-service/main.py -> ai-service/main.py`

## Hyperedges (group relationships)
- **Backend Service Stack** — backend_ci_workflow, backend_smoke_test_job, ai_service_requirements, fastapi [INFERRED 0.75]
- **Database Access Layer** — psycopg2, sqlalchemy, ai_service_requirements [INFERRED 0.75]
- **Frontend Configuration Files** — frontend_readme, frontend_agents_md, frontend_claude_md, nextjs_project [INFERRED 0.85]
- **hyper_frontend_assets** — file_file_svg, file_globe_svg, file_next_svg, file_vercel_svg, file_window_svg [INFERRED 0.95]

## Communities (31 total, 8 thin omitted)

### Community 0 - "Auth & API Schemas"
Cohesion: 0.14
Nodes (35): Request, Session, UserProfile, BaseModel, CodeExplainErrorRequest, CodeGenerateRequest, CodeHintRequest, CodeReviewRequest (+27 more)

### Community 1 - "Database & Backend Core"
Cohesion: 0.10
Nodes (18): init_db(), lifespan(), parse_bool(), AI Service Dependencies, Backend CI Workflow, Backend Smoke Test Job, cloud.json Configuration, FastAPI (+10 more)

### Community 2 - "Job Application Tracker"
Cohesion: 0.24
Nodes (24): Request, Session, JobApplication, JobApplicationCreate, JobApplicationUpdate, JobApplicationCreate, JobApplicationUpdate, PydanticBaseModel (+16 more)

### Community 3 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, @mediapipe/tasks-vision, @monaco-editor/react, next, react, react-dom, react-pdf, devDependencies (+16 more)

### Community 4 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "Code Practice Routes"
Cohesion: 0.22
Nodes (16): Request, get_all_problems(), get_problem_by_id(), explain(), generate(), get_problem(), hint(), list_problems() (+8 more)

### Community 6 - "Tracker UI Page"
Cohesion: 0.11
Nodes (10): Document, EMPTY, Job, JobForm, Page, PC, Priority, SC (+2 more)

### Community 7 - "Generate Routes"
Cohesion: 0.23
Nodes (13): Session, GenerateCoverLetterRequest, GenerateRequest, GenerateRequest, Path, compile_latex(), CompileLatexRequest, generate_cl() (+5 more)

### Community 8 - "LLM Service"
Cohesion: 0.28
Nodes (14): assemble_latex(), build_certifications(), build_cover_letter_prompt(), build_education(), build_experience(), build_heading(), build_projects(), build_prompt() (+6 more)

### Community 9 - "Interview Page UI"
Cohesion: 0.14
Nodes (7): DeliveryMetrics, Document, Feedback, Job, Page, SessionState, Window

### Community 10 - "Code Practice UI"
Cohesion: 0.17
Nodes (7): DIFF_COLORS, Difficulty, MonacoEditor, Problem, ReviewResult, RightPanel, RunResult

### Community 11 - "Interview Routes"
Cohesion: 0.25
Nodes (9): Request, InterviewAnalyzeRequest, InterviewAnalyzeRequest, analyze(), questions(), analyze_answer(), build_delivery_section(), get_questions() (+1 more)

### Community 12 - "Dashboard UI"
Cohesion: 0.20
Nodes (7): AppLayout(), Certification, Education, emptyProfile, Experience, Profile, Project

### Community 13 - "Generate Page UI"
Cohesion: 0.18
Nodes (4): AppState, C, Document, Page

### Community 14 - "Database Models"
Cohesion: 0.36
Nodes (9): Base, Certification, Education, Experience, JobApplication, Profile, Project, Skill (+1 more)

### Community 16 - "Database Routes"
Cohesion: 0.40
Nodes (5): Request, Session, UserProfile, load_profile(), save_profile()

### Community 18 - "MediaPipe Types"
Cohesion: 0.50
Nodes (3): FaceLandmarker, FilesetResolver, PoseLandmarker

### Community 20 - "UI Icons"
Cohesion: 1.00
Nodes (3): Document or File Icon, Globe or World Icon, Window or Browser Window Icon

### Community 21 - "Agent Config"
Cohesion: 0.67
Nodes (3): Frontend AGENTS.md, Frontend CLAUDE.md, Next.js Agent Rules

## Knowledge Gaps
- **87 isolated node(s):** `Config`, `eslintConfig`, `nextConfig`, `name`, `version` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FastAPI` connect `Database & Backend Core` to `Auth & API Schemas`, `Job Application Tracker`, `Code Practice Routes`, `Generate Routes`, `Interview Routes`, `Database Routes`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `SQLAlchemy ORM` connect `Database & Backend Core` to `Database Models`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Request` (e.g. with `JobApplicationCreate` and `JobApplicationUpdate`) actually correct?**
  _`Request` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `Request` (e.g. with `CodeExplainErrorRequest` and `CodeGenerateRequest`) actually correct?**
  _`Request` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Session` (e.g. with `JobApplicationCreate` and `JobApplicationUpdate`) actually correct?**
  _`Session` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Config`, `Save edited LaTeX back to DB and recompile PDF.`, `Build the delivery metrics section for the prompt.` to the rest of the system?**
  _94 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & API Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.1422475106685633 - nodes in this community are weakly interconnected._