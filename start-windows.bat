@echo off
echo ====================================================
echo   Iniciando SLA Sentinel (Modo Plug-and-Play)...
echo ====================================================
start http://localhost:3000
node backend/src/app.js
pause
