@echo off
title Offline RAG Assistant

call venv\Scripts\activate
start "" ollama serve
timeout /t 3 > nul
python app\main.py