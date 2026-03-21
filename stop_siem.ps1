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
            # Use taskkill /T to kill the process TREE, stopping orphaned child processes like node.exe
            $tempNull = Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID $id /T /F" -Wait -NoNewWindow
            Write-Host "Stopped PID $id and its child processes"
        } catch {}
    }
}

Write-Host "Done."
