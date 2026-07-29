@echo off
title BPM & SpO2 Monitoring Dashboard

echo ========================================================
echo   BPM ^& SpO2 Monitoring Dashboard — Development Runner
echo ========================================================
echo.
echo Starting servers...
echo.
echo ========================================================
echo   Backend  : http://localhost:5000
echo   Health   : http://localhost:5000/api/health
echo   Frontend : http://localhost:5173
echo.
echo   Login    : admin@monitoring-bpm.web.id / Admin123!
echo.
echo   Press Ctrl+C to stop both servers
echo ========================================================
echo.

start "Backend Server" cmd /c "cd /d "%~dp0\backend" && npm run dev"

cd /d "%~dp0\frontend"
npm run dev

pause
