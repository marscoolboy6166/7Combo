@echo off
title 7Combo dev server
cd /d "%~dp0"

echo Starting the 7Combo dev server...
echo The site will open at http://localhost:3000 in a few seconds.
echo Keep this window OPEN while you test.
echo To stop: press Ctrl+C in this window (or just close it).
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"

npm run dev
