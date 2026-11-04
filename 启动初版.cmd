@echo off
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Please run npm.cmd install in this folder first.
  pause
  exit /b 1
)
start "" http://127.0.0.1:5178/
call npm.cmd run dev
pause
