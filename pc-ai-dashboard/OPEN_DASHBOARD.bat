@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  set "NODE_EXE=C:\Users\JAI\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "NODE_EXE=node"
)

if not exist "%NODE_EXE%" if not "%NODE_EXE%"=="node" (
  echo Node.js is not installed or not added to PATH.
  echo Install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

echo Starting NeuroNest backend...
start "NeuroNest Backend" /min "%NODE_EXE%" "%~dp0server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo If the browser opened, keep this window or the backend window running while you use the site.
pause
