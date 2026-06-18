@echo off
title alloc-platform
cd /d "%~dp0"

echo =============================================
echo   alloc-platform - Iniciando
echo =============================================
echo.

start "alloc-platform - Backend" cmd /k "cd backend && npm run dev"
start "alloc-platform - Frontend" cmd /k "npm run dev"

echo Aguardando a aplicacao subir...
echo.

:wait
timeout /t 3 /nobreak > nul
curl -s --max-time 2 http://localhost:3000 > nul 2>&1
if errorlevel 1 goto wait

echo Pronto! Abrindo http://localhost:3000 ...
start http://localhost:3000
exit
