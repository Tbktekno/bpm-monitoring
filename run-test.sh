#!/bin/bash
echo "[1/2] Installing dependencies..."
npm install --silent
echo "[2/2] Running system test..."
node test-system.mjs
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ALL TESTS PASSED — Sistem berfungsi dengan baik!"
else
    echo ""
    echo "❌ BEBERAPA TEST GAGAL — Periksa detail di atas."
fi
