Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$backendDir = Join-Path $projectRoot "backend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "No se encontro el ejecutable de Python en $pythonExe. Ejecuta primero la instalacion del backend."
}

Set-Location $backendDir

if (-not $env:CORS_ORIGINS) {
    $env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
}

& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000