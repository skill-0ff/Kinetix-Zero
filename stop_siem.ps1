$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root ".runlogs\pids.txt"

if (!(Test-Path $pidFile)) {
    Write-Host "No PID file found at $pidFile"
    exit 0
}

$lines = Get-Content $pidFile
foreach ($line in $lines) {
    if ($line -match "^[^=]+=([0-9]+)$") {
        $id = [int]$Matches[1]
        try {
            Stop-Process -Id $id -Force
            Write-Host "Stopped PID $id"
        } catch {}
    }
}

Write-Host "Done."
