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

echo Starting NeuroNest backend for phone testing...
start "NeuroNest Backend" /min "%NODE_EXE%" "%~dp0server.js"
timeout /t 2 /nobreak >nul

echo.
echo Open one of these URLs on your phone while connected to the same Wi-Fi:
echo.
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { 'http://' + $_.IPAddress + ':3000' }"
echo.
echo IMPORTANT:
echo For Google login on phone, add the exact phone URL origin in Google Cloud:
echo Example: http://192.168.1.5:3000
echo.
echo Keep this window open while testing.
pause
