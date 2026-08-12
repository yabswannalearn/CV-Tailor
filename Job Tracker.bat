@echo off
set "PROJECT_ROOT=%~dp0"

echo Starting CV Tailor services...

:: Start FastAPI AI service
echo [1/2] Starting FastAPI AI service on :8000
start "AI Service" /D "%PROJECT_ROOT%ai-service" cmd /k "venv\Scripts\python.exe -m uvicorn main:app --reload"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start Next.js frontend
echo [2/2] Starting Next.js frontend on :3000
start "Frontend" /D "%PROJECT_ROOT%frontend" cmd /k "npm run dev"

echo All services starting in separate windows.
pause
