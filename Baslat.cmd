@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Once Node.js 24 LTS kurulmalidir: https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
