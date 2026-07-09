Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"
$npmCmd = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
$stateFile = Join-Path $scriptRoot ".mobile-processes.json"
$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path $pythonExe)) {
    throw "No se encontro $pythonExe. Prepara primero el entorno del backend."
}

if (-not (Test-Path $npmCmd)) {
    $npmCmd = "npm.cmd"
}

function Get-LocalIPv4 {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "169.254*" -and
            $_.IPAddress -ne "127.0.0.1" -and
            $_.InterfaceAlias -notmatch "Loopback|vEthernet|Virtual|VPN|Bluetooth"
        }

    $selected = $candidates | Select-Object -First 1 -ExpandProperty IPAddress
    if (-not $selected) {
        return "127.0.0.1"
    }

    return $selected
}

$localIp = Get-LocalIPv4
$corsOrigins = "https://localhost:5173,https://127.0.0.1:5173,https://$localIp:5173,http://$localIp:5173"

$backendCommand = @"
Set-Location '$backendDir'
`$env:CORS_ORIGINS = '$corsOrigins'
& '$pythonExe' -m uvicorn app.main:app --host 0.0.0.0 --port 8000
"@

$frontendCommand = @"
Set-Location '$frontendDir'
& '$npmCmd' run dev -- --host 0.0.0.0 --port 5173
"@

$backendProc = Start-Process -FilePath $psExe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
) -PassThru

$frontendProc = Start-Process -FilePath $psExe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCommand
) -PassThru

@{
    startedAt = (Get-Date).ToString("s")
    backendPid = $backendProc.Id
    frontendPid = $frontendProc.Id
    backendDir = "$backendDir"
    frontendDir = "$frontendDir"
    localIp = $localIp
} | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Write-Host "Servicios iniciados en modo movil."
Write-Host "Frontend (movil): https://$localIp:5173"
Write-Host "Backend health (movil): http://$localIp:8000/health"
Write-Host "Para detener: .\\scripts\\windows\\stop-mobile.ps1"
