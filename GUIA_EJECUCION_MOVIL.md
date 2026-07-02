# Guia de ejecucion en movil (paso a paso)

Fecha: 2026-07-01

## 1) Requisitos

- PC y celular en la misma red Wi-Fi.
- Backend corriendo en puerto 8000.
- Frontend corriendo en puerto 5173.

## 2) Levantar backend

En `attendance-system/backend` ejecutar:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Validar:

```powershell
Invoke-RestMethod -Method GET -Uri "http://127.0.0.1:8000/health"
```

## 3) Levantar frontend (HTTPS local)

En `attendance-system/frontend` ejecutar:

```powershell
cmd /c npm run dev
```

Validar:

```powershell
cmd /c "curl -k -I https://127.0.0.1:5173"
```

## 4) URL en la red local

IP LAN detectada en esta maquina:

`192.168.102.95`

Abrir en el celular:

`https://192.168.102.95:5173`

Nota:

- El navegador del celular mostrara advertencia por certificado local de desarrollo.
- Debes elegir "Continuar" o "Avanzado > Continuar" para entrar.

## 5) Credenciales de prueba

- Admin: `admin / admin123`
- Logistico: `logistico / logis123`
- Scanner: `scanner / scanner123`

## 6) Nota sobre camara (Scanner)

- En algunos celulares, la camara requiere contexto seguro (HTTPS).
- Si la camara no abre en HTTP local, usar entrada manual del JSON QR.
- El flujo manual (valido + duplicado) ya fue verificado correctamente.

## 7) Estado validado en esta sesion

- Frontend local HTTPS: OK
- Backend local: OK
- Proxy `/api`: OK
- Roles Admin/Logistico/Scanner: OK
- Ruta `/login` y fallback global de rutas: OK
