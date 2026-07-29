# =============================================================================
# Development Runner — BPM & SpO₂ Monitoring Dashboard
# =============================================================================
# Menjalankan backend (Express :5000) dan frontend (Vite :5173) secara bersamaan
# =============================================================================

param(
    [switch]$NoSeed,
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   BPM & SpO₂ Monitoring Dashboard — Development Runner     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── Backend Setup ─────────────────────────────────────────────────────────────

Write-Host "▸ Backend Setup..." -ForegroundColor Yellow
Set-Location -LiteralPath "$rootDir\backend"

if (-not $NoInstall) {
    Write-Host "  npm install..." -ForegroundColor Gray
    npm install
    if (-not $?) { Write-Host "  ✗ npm install gagal" -ForegroundColor Red; exit 1 }
}

Write-Host "  Generate Prisma client..." -ForegroundColor Gray
npx prisma generate
if (-not $?) { Write-Host "  ✗ Prisma generate gagal" -ForegroundColor Red; exit 1 }

Write-Host "  Push database schema..." -ForegroundColor Gray
npx prisma db push
if (-not $?) { Write-Host "  ✗ Prisma push gagal" -ForegroundColor Red; exit 1 }

if (-not $NoSeed) {
    Write-Host "  Seed database..." -ForegroundColor Gray
    npx prisma db seed
    if (-not $?) { Write-Host "  ✗ Seeding gagal" -ForegroundColor Red; exit 1 }
}

# ─── Frontend Setup ────────────────────────────────────────────────────────────

Write-Host "▸ Frontend Setup..." -ForegroundColor Yellow
Set-Location -LiteralPath "$rootDir\frontend"

if (-not $NoInstall) {
    Write-Host "  npm install..." -ForegroundColor Gray
    npm install
    if (-not $?) { Write-Host "  ✗ npm install gagal" -ForegroundColor Red; exit 1 }
}

# ─── Start Both Servers ────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Memulai server...                                       ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║   Backend  → http://localhost:5000/api/v1                  ║" -ForegroundColor Green
Write-Host "║   Health   → http://localhost:5000/api/health              ║" -ForegroundColor Green
Write-Host "║   Frontend → http://localhost:5173                         ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║   Login: admin@monitoring-bpm.web.id / Admin123!          ║" -ForegroundColor Green
Write-Host "║                                                          ║" -ForegroundColor Green
Write-Host "║   Tekan Ctrl+C untuk menghentikan kedua server            ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ─── Run Backend & Frontend Concurrently ───────────────────────────────────────

try {
    # Start backend in background job
    $backendJob = Start-Job -ScriptBlock {
        Set-Location -LiteralPath "$using:rootDir\backend"
        npm run dev
    }

    # Start frontend in foreground
    Set-Location -LiteralPath "$rootDir\frontend"
    npm run dev
}
finally {
    # Cleanup: stop backend job when frontend exits
    Write-Host ""
    Write-Host "Menghentikan server..." -ForegroundColor Yellow
    if ($backendJob -and $backendJob.State -eq 'Running') {
        Stop-Job $backendJob
        Remove-Job $backendJob
    }
    Set-Location -LiteralPath $rootDir
    Write-Host "Server dihentikan." -ForegroundColor Green
}
