$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logDir = Join-Path $root ".runlogs"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Start-Component {
    param(
        [string]$Name,
        [string]$FilePath,
        [string]$Arguments = "",
        [hashtable]$EnvVars = @{},
        [string]$WorkDir = $root
    )

    $outLog = Join-Path $logDir "$Name.out.log"
    $errLog = Join-Path $logDir "$Name.err.log"

    foreach ($k in $EnvVars.Keys) {
        [System.Environment]::SetEnvironmentVariable($k, $EnvVars[$k], "Process")
    }

    if ([string]::IsNullOrWhiteSpace($Arguments)) {
        $p = Start-Process -FilePath $FilePath -WorkingDirectory $WorkDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    } else {
        $p = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    }

    return $p
}

Write-Host "Starting SIEM stack from $root"

<<<<<<< HEAD
$mongoPath = "mongod"
if (!(Get-Command mongod -ErrorAction SilentlyContinue)) {
    $possiblePath = Get-ChildItem "C:\Program Files\MongoDB\Server\*\bin\mongod.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($possiblePath) {
        $mongoPath = $possiblePath.FullName
    }
}

if ($mongoPath -ne "mongod" -or (Get-Command mongod -ErrorAction SilentlyContinue)) {
=======
if (Get-Process mongod -ErrorAction SilentlyContinue) {
    Write-Host "MongoDB is already running."
} elseif (Get-Command mongod -ErrorAction SilentlyContinue) {
>>>>>>> 09893c936dd507ce0034cf9280bb9b52eee617ea
    $mongoData = Join-Path $root "DB\mongo-data"
    if (!(Test-Path $mongoData)) {
        New-Item -ItemType Directory -Path $mongoData | Out-Null
    }
    $mongo = Start-Process -FilePath "`"$mongoPath`"" -ArgumentList "--dbpath `"$mongoData`" --bind_ip 127.0.0.1 --port 27017" -WorkingDirectory $root -RedirectStandardOutput (Join-Path $logDir "mongo.out.log") -RedirectStandardError (Join-Path $logDir "mongo.err.log") -PassThru
    Write-Host "MongoDB started (PID $($mongo.Id)) via $($mongoPath)"
} else {
    Write-Warning "mongod not found in PATH or default install dir. Dashboard data will not update without MongoDB."
}

$api = Start-Component -Name "api" -FilePath "python" -Arguments "-m uvicorn engine.api.server:app --host 0.0.0.0 --port 8000"
Write-Host "API started (PID $($api.Id))"

$collector = Start-Component -Name "collector" -FilePath "python" -Arguments (Join-Path $root "engine\collector\collector.py")
Write-Host "Collector started (PID $($collector.Id))"

$brain = Start-Component -Name "brain" -FilePath "python" -Arguments "engine\core\brain.py" -EnvVars @{ TORCH_COMPILE_DISABLE = "1"; PYTHONUNBUFFERED = "1"; PYTHONPATH = "." }
Write-Host "Brain started (PID $($brain.Id))"

$frontend = Start-Component -Name "frontend" -FilePath "cmd.exe" -Arguments "/c npm.cmd run dev" -WorkDir (Join-Path $root "frontend")
Write-Host "Frontend started (PID $($frontend.Id))"

$pids = @(
    "api=$($api.Id)"
    "collector=$($collector.Id)"
    "brain=$($brain.Id)"
    "frontend=$($frontend.Id)"
)
Set-Content -Path (Join-Path $logDir "pids.txt") -Value $pids -Encoding UTF8

Write-Host ""
Write-Host "Done."
Write-Host "Dashboard: http://localhost:5173"
Write-Host "API docs:   http://localhost:8000/docs"
Write-Host "Logs:       $logDir"
