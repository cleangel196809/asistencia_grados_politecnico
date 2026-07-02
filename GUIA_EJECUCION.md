# Guia detallada para ejecutar la aplicacion y crear servicios en Windows

## 1. Que contiene esta guia

Esta guia cubre dos formas de ejecucion:

1. Ejecucion de desarrollo en terminal (rapida para pruebas).
2. Ejecucion persistente como servicios de Windows (arranque automatico).

Tambien incluye validaciones, comandos de control y solucion de errores comunes.

## 2. Requisitos previos

Verifica que tengas:

1. Python 3.12+
2. Node.js 22+
3. npm 10+
4. PowerShell
5. Permisos de administrador para crear servicios de Windows

Comprobacion rapida:

```powershell
python --version
node --version
npm.cmd --version
```

Nota: en algunos equipos `npm` falla por Execution Policy de PowerShell. Usa `npm.cmd`.

## 3. Preparar backend

Desde la carpeta del proyecto:

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system\backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe check_imports.py
```

Resultado esperado:

```text
backend-ok
```

## 4. Preparar frontend

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system\frontend"
npm.cmd install
```

## 5. Ejecutar en modo desarrollo (sin servicios)

Abre dos terminales.

Terminal 1 (backend):

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 (frontend):

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system\frontend"
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Prueba de salud del backend:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" | Select-Object -ExpandProperty Content
```

Respuesta esperada:

```json
{"status":"ok","mode":"mock"}
```

Abre en navegador:

1. Frontend: http://127.0.0.1:5173
2. Backend docs: http://127.0.0.1:8000/docs

Credenciales demo:

1. `admin` / `admin123`
2. `logistico` / `logis123`
3. `scanner` / `scanner123`

## 6. Scripts creados para servicios Windows

Se agregaron estos archivos:

1. `scripts/windows/start-backend.ps1`
2. `scripts/windows/start-frontend.ps1`
3. `scripts/windows/install-services.ps1`

Funcion:

1. Arranque backend en puerto 8000.
2. Arranque frontend en puerto 5173.
3. Instalacion/remocion/control de servicios.

## 7. Crear servicios de Windows (persistentes)

Importante: esta parte requiere **PowerShell como Administrador**.

1. Abre PowerShell como administrador.
2. Ejecuta:

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system"
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action install
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action start
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action status
```

Servicios creados:

1. `attendance-backend`
2. `attendance-frontend`

## 8. Comandos de operacion diaria de servicios

Desde PowerShell administrador:

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system"

# estado
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action status

# detener
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action stop

# iniciar
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action start

# reiniciar
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action restart

# eliminar servicios
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-services.ps1" -Action remove
```

## 9. Variables de entorno opcionales

Backend:

1. `MONGO_URI` (si usas MongoDB real)
2. `MONGO_DB` (nombre de base)
3. `CORS_ORIGINS` (dominios frontend permitidos)

Si no defines MongoDB, el backend usa modo `mock` para desarrollo.

## 10. Solucion de problemas

### Error: npm.ps1 bloqueado

Usa `npm.cmd` en lugar de `npm`.

### Error: se requiere administrador

Abre PowerShell con "Ejecutar como administrador".

### Error: puerto ocupado 8000 o 5173

```powershell
netstat -ano | findstr :8000
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Error: backend no inicia por dependencias

```powershell
cd "c:\Users\clean\OneDrive\Escritorio\metodologia de software\N2\attendance-system\backend"
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe check_imports.py
```

### Error al consultar /health con advertencia de script

Usa siempre `-UseBasicParsing`:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health"
```

## 11. Checklist final

1. Backend responde `status ok` en `/health`.
2. Frontend abre en `http://127.0.0.1:5173`.
3. Login con usuario demo funciona.
4. Servicios aparecen como `Running` si fueron instalados.
5. Reinicio del equipo mantiene servicios activos (inicio automatico).
