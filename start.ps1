# ============================================================
# LiveMail Classifier - Clean Start Script
# Usage: .\start.ps1
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LiveMail Classifier - Starting Up" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Freeing ports 3000 and 5000..." -ForegroundColor Yellow

$pids5000 = netstat -ano | Select-String "LISTENING" | Select-String ":5000 " | ForEach-Object { ($_ -split '\s+')[-1] }
$pids3000 = netstat -ano | Select-String "LISTENING" | Select-String ":3000 " | ForEach-Object { ($_ -split '\s+')[-1] }
$allPids = ($pids5000 + $pids3000) | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -Unique

if ($allPids) {
    foreach ($p in $allPids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host "   Killed PID $p" -ForegroundColor Gray
    }
    Start-Sleep -Seconds 1
}
Write-Host "   Ports freed!" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Backend  -> http://localhost:5000" -ForegroundColor Cyan
Write-Host "      Frontend -> http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "[3/3] Running npm run dev  (Ctrl+C to stop)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

npm run dev
