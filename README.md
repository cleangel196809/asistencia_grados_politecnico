# Sistema de control de asistencia para eventos de grado

Aplicación full-stack para gestión de eventos, participantes, generación de códigos QR y validación de asistencia en modo online/offline. La solución incluye:

- Backend FastAPI con MongoDB-compatible storage (MongoDB real o modo mock local para desarrollo)
- Frontend React PWA para administración y escaneo con cámara
- QR por participante/evento
- Modo online/offline con cola de sincronización
- WebSockets para tiempo real

## Requisitos

- Python 3.12+
- Node.js 22+
- npm 10+

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --host 0.0.0.0
```

### Variables de entorno

- `MONGO_URI`: URI de MongoDB real. Ejemplo: `mongodb://localhost:27017`
- `MONGO_DB`: nombre de la base de datos. Por defecto: `attendance_system`

## Uso

1. Abra el frontend en `http://localhost:5173`
2. Cree un evento y defina su modo ONLINE/OFFLINE
3. Agregue participantes o importe un Excel
4. Use el scanner para leer los QR desde la cámara
5. Si el modo offline está activo, las entradas se guardan localmente y se sincronizan cuando vuelva la conexión
