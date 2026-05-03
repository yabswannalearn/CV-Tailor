@echo off
echo Starting CV Tailor services...

:: Start Go PDF service - REMOVED (Migrated to Tectonic in FastAPI)
:: echo [1/3] Starting Go PDF service on :8081
:: start "PDF Service" cmd /k "cd /d "C:\vscode\CV Tailor Go\pdf-service" && go run main.go"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start FastAPI AI service
echo [2/3] Starting FastAPI AI service on :8000
start "AI Service" cmd /k "cd /d "C:\vscode\CV Tailor Go\ai-service" && venv\Scripts\activate && uvicorn main:app --reload"

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Start Next.js frontend
echo [3/3] Starting Next.js frontend on :3000
start "Frontend" cmd /k "cd /d "C:\vscode\CV Tailor Go\frontend" && npm run dev"

echo All services starting in separate windows.
pause