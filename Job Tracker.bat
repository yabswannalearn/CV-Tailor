@echo off
echo Starting CV Tailor services...

:: Start Celery Worker
echo [1/3] Starting Celery worker
start "Celery Worker" cmd /k "cd /d ""C:\vscode\Personal\CV Tailor Go\ai-service"" && venv\Scripts\activate && python -m celery -A celery_app worker --loglevel=info --pool=solo"

:: Start FastAPI AI service
echo [2/3] Starting FastAPI AI service on :8000
start "AI Service" cmd /k "cd /d ""C:\vscode\Personal\CV Tailor Go\ai-service"" && venv\Scripts\activate && uvicorn main:app --reload"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start Next.js frontend
echo [3/3] Starting Next.js frontend on :3000
start "Frontend" cmd /k "cd /d ""C:\vscode\Personal\CV Tailor Go\frontend"" && npm run dev"

echo All services starting in separate windows.
pause