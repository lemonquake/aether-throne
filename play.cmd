@echo off
setlocal
title Aether Throne
cd /d "%~dp0"

echo ========================================
echo Aether Throne
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install the Node.js LTS release from https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH.
  echo Reinstall Node.js LTS, then run this launcher again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c = [Net.Sockets.TcpClient]::new('127.0.0.1', 5173); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Aether Throne is already running at http://localhost:5173/
  start "" "http://localhost:5173/"
  exit /b 0
)

if not exist "node_modules\" (
  echo Installing dependencies...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
  echo.
)

echo Starting Aether Throne at http://localhost:5173/
echo Press Ctrl+C here to stop the server.
echo.
call npm run dev -- --open
