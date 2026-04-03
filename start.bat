@echo off
title Offline RAG Assistant - Startup

echo ============================================
echo   Starting Offline RAG Assistant System
echo ============================================

REM Activate venv
call venv\Scripts\activate.bat

REM Set paths
set PATH=%PATH%;C:\Program Files\Tesseract-OCR
set PATH=%PATH%;C:\poppler\Library\bin
set HF_HUB_DISABLE_TELEMETRY=1

REM Start Ollama
echo Starting Ollama...
start "" cmd /k "ollama serve"

timeout /t 5 > nul

REM Start FastAPI (IMPORTANT FIX HERE)
echo Starting backend...
start "" cmd /k "python app\main.py"

REM Open browser
timeout /t 3 > nul
start http://127.0.0.1:8000

echo System started!
pause