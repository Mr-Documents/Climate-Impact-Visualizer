# Download progress at a glance.
#   .\status.ps1
# Reads the cache directory directly, so it is accurate whether or not a
# download is running. Never writes anything, and is safe to run in a second
# window alongside a live download.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = Join-Path $root "data\raw"
$total = 60

$f = @(Get-ChildItem "$raw\*.parquet" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
$n = $f.Count
$pct = [math]::Round(100 * $n / $total)

$filled = [math]::Round(40 * $n / $total)
$bar = ("#" * $filled) + ("." * (40 - $filled))
Write-Host ""
Write-Host "  [$bar] $n / $total  ($pct%)"

if ($n -gt 0) {
    Write-Host "  latest    : $($f[-1].BaseName) at $($f[-1].LastWriteTime.ToString('dd MMM HH:mm'))"
}

$downloader = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*download_climate_data*' }
$wrapper = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*run_download*' }

if ($downloader) {
    $mins = [math]::Round(((Get-Date) - $downloader[0].CreationDate).TotalMinutes)
    Write-Host "  process   : RUNNING (PID $($downloader[0].ProcessId), $mins min)" -ForegroundColor Green
} elseif ($wrapper) {
    Write-Host "  process   : wrapper alive, downloader restarting shortly" -ForegroundColor Green
} else {
    Write-Host "  process   : not running" -ForegroundColor Yellow
}

if ($n -ge $total) {
    Write-Host ""
    Write-Host "  COMPLETE - all $total locations downloaded" -ForegroundColor Green
    Write-Host "  Next:  .\.venv\Scripts\python.exe scripts\train.py" -ForegroundColor Cyan
    Write-Host ""
    return
}

# Throughput is capped by the free-tier quota (10,000 weighted calls/day at
# ~783 per location), not by bandwidth.
$days = [math]::Round(($total - $n) / 12.8, 1)
Write-Host "  remaining : $($total - $n) locations  (~$days days at the daily quota)"
Write-Host ""

# Only suggest starting a download when nothing is running - otherwise a second
# copy would compete for the same quota and throttle both.
if ($downloader -or $wrapper) {
    Write-Host "  Already running - nothing to do. Just leave it." -ForegroundColor Green
    Write-Host "  Watch live:  Get-Content download.log -Tail 20 -Wait"
} else {
    Write-Host "  Not running. Start it with:" -ForegroundColor Cyan
    Write-Host "    .\run_download.ps1"
}
Write-Host ""
