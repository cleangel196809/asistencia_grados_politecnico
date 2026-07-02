Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$frontendDir = Join-Path $projectRoot "frontend"

$npmCmd = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
if (-not (Test-Path $npmCmd)) {
    $npmCmd = "npm.cmd"
}

Set-Location $frontendDir
& $npmCmd run dev -- --host 127.0.0.1 --port 5173