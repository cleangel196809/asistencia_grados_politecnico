param(
    [ValidateSet("install", "remove", "start", "stop", "restart", "status")]
    [string]$Action = "install"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$serviceBackend = "attendance-backend"
$serviceFrontend = "attendance-frontend"

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw "Este script requiere PowerShell como Administrador."
    }
}

function Build-BinPath([string]$scriptPath) {
    return "`"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`" -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
}

function Install-Services {
    Assert-Admin

    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    $backendScript = Resolve-Path (Join-Path $scriptRoot "start-backend.ps1")
    $frontendScript = Resolve-Path (Join-Path $scriptRoot "start-frontend.ps1")

    if (Get-Service -Name $serviceBackend -ErrorAction SilentlyContinue) {
        Write-Host "Servicio $serviceBackend ya existe."
    } else {
        sc.exe create $serviceBackend start= auto displayname= "Attendance Backend" binPath= (Build-BinPath $backendScript)
    }

    if (Get-Service -Name $serviceFrontend -ErrorAction SilentlyContinue) {
        Write-Host "Servicio $serviceFrontend ya existe."
    } else {
        sc.exe create $serviceFrontend start= auto displayname= "Attendance Frontend" binPath= (Build-BinPath $frontendScript)
    }

    sc.exe description $serviceBackend "Backend FastAPI (puerto 8000) para attendance-system"
    sc.exe description $serviceFrontend "Frontend Vite (puerto 5173) para attendance-system"

    Write-Host "Servicios registrados. Usa -Action start para iniciarlos."
}

function Remove-Services {
    Assert-Admin
    foreach ($name in @($serviceBackend, $serviceFrontend)) {
        if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
            sc.exe stop $name | Out-Null
            sc.exe delete $name
            Write-Host "Servicio $name eliminado."
        } else {
            Write-Host "Servicio $name no existe."
        }
    }
}

function Start-Services {
    Assert-Admin
    foreach ($name in @($serviceBackend, $serviceFrontend)) {
        if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
            sc.exe start $name
        } else {
            Write-Host "Servicio $name no existe."
        }
    }
}

function Stop-Services {
    Assert-Admin
    foreach ($name in @($serviceFrontend, $serviceBackend)) {
        if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
            sc.exe stop $name
        } else {
            Write-Host "Servicio $name no existe."
        }
    }
}

function Restart-Services {
    Stop-Services
    Start-Services
}

function Status-Services {
    foreach ($name in @($serviceBackend, $serviceFrontend)) {
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($svc) {
            Write-Host "$name => $($svc.Status)"
        } else {
            Write-Host "$name => NO_EXISTE"
        }
    }
}

switch ($Action) {
    "install" { Install-Services }
    "remove" { Remove-Services }
    "start" { Start-Services }
    "stop" { Stop-Services }
    "restart" { Restart-Services }
    "status" { Status-Services }
}