@echo off
echo Starting CV Tailor services...

:: Go PDF service REMOVED (migrated to Tectonic in FastAPI)

:: Start FastAPI AI service
echo [1/2] Starting FastAPI AI service on :8000
start "AI Service" cmd /k "cd /d "C:\vscode\Personal\CV Tailor Go\ai-service" && venv\Scripts\activate && uvicorn main:app --reload"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start Next.js frontend
echo [2/2] Starting Next.js frontend on :3000
start "Frontend" cmd /k "cd /d "C:\vscode\Personal\CV Tailor Go\frontend" && npm run dev"

echo All services starting in separate windows.
pause