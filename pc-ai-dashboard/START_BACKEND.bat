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
  echo Then double-click this file again.
  pause
  exit /b 1
)

echo Starting NeuroNest at http://localhost:3000
"%NODE_EXE%" server.js
pause
