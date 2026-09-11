# Runs the climate download continuously until all 60 locations are cached.
#
# The Python downloader already handles rate limiting internally: on HTTP 429 it
# sleeps 61 minutes and retries the SAME location, so it never loses a location
# to a throttle. This wrapper adds the outer layer of resilience - if the
# downloader exits for any other reason (network drop, transient crash), it is
# restarted after a short pause, and the whole thing stops cleanly once the
# cache is complete.
#
# Deliberately run WITHOUT --budget: the point is unattended progress, so the
# script is allowed to sit through cooldowns rather than stopping at the daily
# quota and waiting for a human.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
$script = Join-Path $root "scripts\download_climate_data.py"
$raw = Join-Path $root "data\raw"
$log = Join-Path $root "download.log"
$total = 60
$restartPauseSeconds = 300

function Write-Log($message) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

function Get-Count {
    @(Get-ChildItem "$raw\*.parquet" -ErrorAction SilentlyContinue).Count
}

Write-Log "=== wrapper started (pid $PID) ==="

if (-not (Test-Path $python)) {
    Write-Log "FATAL: python not found at $python"
    exit 1
}

while ($true) {
    $count = Get-Count
    if ($count -ge $total) {
        Write-Log "COMPLETE - $count/$total locations cached. Wrapper exiting."
        break
    }

    Write-Log "starting downloader ($count/$total cached)"
    & $python $script 2>&1 | ForEach-Object { Add-Content -Path $log -Value $_ -Encoding utf8 }
    $code = $LASTEXITCODE

    $count = Get-Count
    if ($count -ge $total) {
        Write-Log "COMPLETE - $count/$total locations cached. Wrapper exiting."
        break
    }

    Write-Log "downloader exited (code $code) at $count/$total - restarting in $restartPauseSeconds s"
    Start-Sleep -Seconds $restartPauseSeconds
}
