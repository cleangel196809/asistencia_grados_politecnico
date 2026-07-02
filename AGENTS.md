# AGENTS

## Scope

These instructions apply to the attendance-system project only.

## Read First

- Project overview: [README.md](README.md)
- Local execution and Windows services: [GUIA_EJECUCION.md](GUIA_EJECUCION.md)
- Mobile/LAN execution: [GUIA_EJECUCION_MOVIL.md](GUIA_EJECUCION_MOVIL.md)
- N2 acceptance context and recent fixes: [CHECKLIST_ACEPTACION_N2.md](CHECKLIST_ACEPTACION_N2.md)

## Tech Stack

- Backend: FastAPI + Python 3.12 (`backend/app/main.py`)
- Storage: MongoDB compatible store with mock fallback (`backend/app/database.py`)
- Frontend: React + Vite + PWA (`frontend/src/App.jsx`, `frontend/vite.config.js`)

## Dev Commands (Windows PowerShell)

Use npm.cmd (not npm) to avoid PowerShell execution policy wrapper issues.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe check_imports.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd frontend
npm.cmd install
cmd /c npm run dev
```

### Quick health checks

```powershell
cmd /c "curl -k https://127.0.0.1:5173/api/health"
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/health" | Select-Object -ExpandProperty Content
```

## Test Commands

There is no unified test runner config at repo root. Use direct module/file execution for backend tests.

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest tests\test_auth.py
.\.venv\Scripts\python.exe -m pytest tests\test_event_reporting_and_qr.py
```

If pytest is not available in the active environment, install it in backend virtualenv before running pytest-based tests.

## Architecture and Boundaries

- Keep API route definitions centralized in `backend/app/main.py`.
- Keep persistence and mock/real DB adaptation inside `backend/app/database.py`.
- Keep frontend application state and role-based views in `frontend/src/App.jsx` unless refactoring is explicitly requested.
- Keep Vite server/proxy/mobile connectivity settings in `frontend/vite.config.js`.

## Critical Project Conventions

- Frontend API base should remain environment-aware and proxy-friendly (`/api` via Vite proxy for local mobile/LAN).
- Vite dev server is intentionally configured for mobile testing:
  - host `0.0.0.0`
  - port `5173`
  - https enabled
  - `/api` proxy to backend on `127.0.0.1:8000`
- Role flows must remain functional for ADMIN, LOGISTICO, and SCANNER.

## Known Pitfalls

- FastAPI dynamic route collisions can break static endpoints. Keep static QR bulk path before participant QR path:
  - `/events/{event_id}/qr/bulk`
  - `/events/{event_id}/qr/{participant_id}`
- Mobile camera access may fail in insecure contexts. Preserve HTTPS local dev behavior for scanner testing.
- PowerShell 5.1 can fail with some modern flags. Prefer `cmd /c` and `curl -k` for HTTPS local checks.

## Change Safety Checklist

Before finishing a change, validate:

1. Backend starts and `/health` returns status ok.
2. Frontend serves on 5173 and proxy calls to `/api/health` succeed.
3. Login still works for all three demo roles.
4. Admin bulk actions do not regress (bulk create, bulk QR, mass send prep).
5. Scanner flow still supports duplicate detection.

## When Updating Docs

- Do not duplicate existing execution instructions.
- Update and link the source document instead:
  - `GUIA_EJECUCION.md` for local/services setup changes
  - `GUIA_EJECUCION_MOVIL.md` for LAN/mobile changes
  - `CHECKLIST_ACEPTACION_N2.md` for acceptance evidence changes
