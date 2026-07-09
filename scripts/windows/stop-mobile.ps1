Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $scriptRoot ".mobile-processes.json"

$stopped = @()

function Stop-IfRunning([int]$processId) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $processId -Force
        return $true
    }

    return $false
}

if (Test-Path $stateFile) {
    try {
        $state = Get-Content -Path $stateFile -Raw | ConvertFrom-Json

        if ($state.backendPid -and (Stop-IfRunning -pid ([int]$state.backendPid))) {
            $stopped += "backend PID $($state.backendPid)"
        }

        if ($state.frontendPid -and (Stop-IfRunning -pid ([int]$state.frontendPid))) {
            $stopped += "frontend PID $($state.frontendPid)"
        }
    }
    catch {
        Write-Host "No se pudo leer el archivo de estado. Se intentara un cierre por patrones."
    }
}

if ($stopped.Count -eq 0) {
    $fallback = Get-CimInstance Win32_Process |
        Where-Object {
            ($_.Name -ieq "python.exe" -and $_.CommandLine -match "uvicorn app.main:app") -or
            ($_.CommandLine -match "npm run dev" -and $_.CommandLine -match "attendance-system\\frontend")
        }

    foreach ($proc in $fallback) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped += "PID $($proc.ProcessId)"
    }
}

if (Test-Path $stateFile) {
    Remove-Item $stateFile -Force
}

if ($stopped.Count -gt 0) {
    Write-Host "Procesos detenidos:"
    $stopped | ForEach-Object { Write-Host " - $_" }
} else {
    Write-Host "No se encontraron procesos activos de inicio movil."
}
