@echo off
start "" "http://localhost:3100"
echo Opened http://localhost:3100 in your browser.
echo If the page does not load, run START_BACKEND.bat first.
timeout /t 4 >nul
