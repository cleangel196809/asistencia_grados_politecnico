# Guía de despliegue en la nube

Stack elegido: **Render** (backend FastAPI) + **MongoDB Atlas** (base de datos) + **Vercel** (frontend React/PWA). Los tres tienen capa gratuita suficiente para un proyecto académico/institucional de tamaño moderado.

## 0. Resumen de arquitectura en producción

```
Navegador / móvil (PWA)
   │  HTTPS
   ▼
Vercel (frontend React, estático)
   │  fetch a VITE_API_BASE_URL
   ▼
Render (backend FastAPI, Docker/Python)
   │  MONGO_URI
   ▼
MongoDB Atlas (base de datos administrada)
```

## 1. Crear el clúster de MongoDB Atlas

1. Crea una cuenta en https://www.mongodb.com/cloud/atlas/register (gratis).
2. Crea un **Cluster gratuito (M0)**, región cercana (ej. AWS us-east-1).
3. En "Database Access", crea un usuario de base de datos con contraseña (guarda usuario/clave).
4. En "Network Access", agrega `0.0.0.0/0` (permitir acceso desde cualquier IP) — suficiente para Render, que usa IPs dinámicas en el plan gratuito.
5. En "Database" → "Connect" → "Drivers", copia el connection string, forma:
   ```
   mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
6. Reemplaza `<usuario>` y `<password>` con tus credenciales reales. Este valor va en la variable `MONGO_URI` del backend.

## 2. Desplegar el backend (FastAPI) en Render

1. Sube el proyecto a GitHub primero (ver `GUIA_EJECUCION.md` y la sección de Git de este documento).
2. Entra a https://render.com y crea cuenta (puedes usar tu cuenta de GitHub).
3. "New +" → "Web Service" → conecta el repo `cleangel196809/asistencia_grados_politecnico`.
4. Configura:
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free
5. En "Environment", agrega las variables (mismas del `.env.example`):
   - `MONGO_URI` = el connection string de Atlas
   - `MONGO_DB` = `attendance_system`
   - `CORS_ORIGINS` = URL de tu frontend en Vercel (la agregas después de crearlo, ej. `https://asistencia-politecnico.vercel.app`)
   - `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_USE_TLS`
   - `TRELLO_API_KEY`, `TRELLO_API_TOKEN`, `TRELLO_BOARD_ID`, `TRELLO_LIST_ID_WHATSAPP_PENDING`
6. Despliega. Render te da una URL pública, ej. `https://asistencia-backend.onrender.com`.
7. Verifica: `https://asistencia-backend.onrender.com/health` debe responder `{"status":"ok","mode":"mongo"}`.

Nota: el plan gratuito de Render "duerme" el servicio tras inactividad; el primer request después de dormir tarda ~30-50s en responder. Para un evento de grado real, actívalo minutos antes o usa un plan pago para evitar el "cold start".

## 3. Desplegar el frontend (React/PWA) en Vercel

1. Entra a https://vercel.com y crea cuenta (puedes usar GitHub).
2. "Add New..." → "Project" → importa `cleangel196809/asistencia_grados_politecnico`.
3. Configura:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. En "Environment Variables", agrega:
   - `VITE_API_BASE_URL` = `https://asistencia-backend.onrender.com` (la URL de Render del paso anterior, SIN `/api` al final si el frontend usa rutas absolutas; revisa `frontend/src/App.jsx` línea de `axios.create`).
5. Despliega. Vercel te da una URL pública, ej. `https://asistencia-politecnico.vercel.app`.
6. Vuelve a Render y actualiza `CORS_ORIGINS` agregando esa URL de Vercel. Redeploy del backend.

## 4. Verificación end-to-end en producción

1. Abre la URL de Vercel en el navegador del celular que usarás como scanner.
2. Instala la PWA ("Agregar a pantalla de inicio" / "Instalar app").
3. Inicia sesión con `admin` / `admin123` y confirma que el panel de 5 pasos carga.
4. Crea un evento de prueba, un participante, genera su QR y escanéalo con el rol `scanner`.
5. Verifica que doble escaneo del mismo QR se rechace como duplicado.
6. Prueba desconectar el WiFi/datos del celular scanner: debe seguir funcionando en modo offline (IndexedDB) y sincronizar al reconectar.

## 5. Alternativas si prefieres otro proveedor

- **Railway** (todo en uno: backend + Mongo + frontend en un solo dashboard) — más simple de administrar pero límites de free tier más ajustados.
- **VPS propio** (DigitalOcean, EC2, etc.) — usa Docker Compose con `backend` + `mongo` + `nginx` sirviendo el build de `frontend/dist`. Pide esta guía específica si decides ese camino.

## 6. Seguridad antes de ir a producción real

- Cambia las contraseñas demo (`admin123`, `logis123`, `scanner123`) desde el panel de administración (paso 5, "Usuarios") antes del evento real.
- Nunca subas el archivo `.env` real a git (ya está en `.gitignore`).
- Usa contraseñas de aplicación (App Passwords) para SMTP, nunca la contraseña principal del correo institucional.
