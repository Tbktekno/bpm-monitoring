@echo off
title BPM System Test
echo [1/2] Installing dependencies...
call npm install --silent
echo [2/2] Running system test...
node test-system.mjs
if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ ALL TESTS PASSED — Sistem berfungsi dengan baik!
) else (
    echo.
    echo ❌ BEBERAPA TEST GAGAL — Periksa detail di atas.
)
pause
