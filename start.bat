@echo off
start "" /min ollama serve
timeout /t 4>nul
start "" dist\main.exe
timeout /t 3>nul
start http://127.0.0.1:8000
