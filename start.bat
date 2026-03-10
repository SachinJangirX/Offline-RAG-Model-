@echo off
title Offline RAG Chatbot

echo =====================================
echo Starting Offline RAG Chatbot System
echo =====================================

echo.
echo Activating Python virtual environment...
call venv\Scripts\activate

echo.
echo Starting Ollama server...
start cmd /k ollama serve

timeout /t 5

echo.
echo Starting backend server...
start cmd /k python app\main.py

timeout /t 8

echo.
echo Opening chatbot interface...
start http://localhost:8000

pause
