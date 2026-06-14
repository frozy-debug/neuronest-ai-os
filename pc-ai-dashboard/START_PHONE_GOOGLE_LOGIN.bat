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

where ngrok >nul 2>nul
if errorlevel 1 (
  echo ngrok is not installed yet.
  echo.
  echo Step 1: Download ngrok from:
  echo https://ngrok.com/download
  echo.
  echo Step 2: Login to ngrok and copy your authtoken.
  echo Step 3: Run this once in Command Prompt:
  echo ngrok config add-authtoken YOUR_TOKEN_HERE
  echo.
  echo Then double-click this file again.
  pause
  exit /b 1
)

echo Starting NeuroNest backend on http://localhost:3000 ...
start "NeuroNest Backend" /min "%NODE_EXE%" "%~dp0server.js"
timeout /t 2 /nobreak >nul

echo Starting ngrok public HTTPS tunnel ...
start "NeuroNest ngrok" ngrok http 3000
timeout /t 4 /nobreak >nul

echo.
echo A browser window will open with ngrok tunnel details.
echo Copy the HTTPS Forwarding URL. It looks like:
echo https://abc123.ngrok-free.app
echo.
echo Add that exact URL to Google Cloud:
echo Clients ^> NeuroNest ^> Authorized JavaScript origins
echo.
echo Then open that same HTTPS URL on your phone.
echo.
start "" "http://127.0.0.1:4040"
pause
