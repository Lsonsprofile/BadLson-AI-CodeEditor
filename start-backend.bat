@echo off
cd /d "%~dp0"
echo ========================================
echo  BadLson Backend Starter
echo ========================================
echo.
if not exist "backend\server.mjs" (
  echo ERROR: backend\server.mjs not found
  echo Run this from the project root folder.
  pause
  exit /b 1
)
if not exist "backend\.env" (
  echo WARNING: backend\.env is missing!
  echo Create backend\.env with OPENROUTER_API_KEY=...
  echo.
)
set NODE_ENV=development
set SKIP_AUTH=true
echo Starting on port 5002...
echo After it starts, open: http://localhost:5002/api/health
echo.
node --watch backend/server.mjs
if errorlevel 1 (
  echo.
  echo Backend crashed. Common fixes:
  echo   1. cd backend ^&^& npm install
  echo   2. Check port 5002 is free
  echo   3. Check backend\.env exists
)
pause
