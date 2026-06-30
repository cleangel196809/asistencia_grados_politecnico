# 🎓 Sistema de Control de Asistencia a Eventos de Grado
## Politécnico Internacional

Aplicación full-stack completa para el control de asistencia a ceremonias de grado, con soporte para modo online y offline, escáner PWA, generación y envío masivo de códigos QR.

---

## 📋 Descripción del Proyecto

Sistema integral que permite:
- **Gestión de eventos** de grado con horarios configurables
- **Carga masiva de participantes** desde Excel
- **Generación automática de códigos QR** únicos por invitado
- **Envío de QR** por WhatsApp (Twilio) y Email (SMTP)
- **Escaneo de QR** en tiempo real con validación única
- **Modo Offline completo** con sincronización automática
- **Reportes Excel** de asistencia y pendientes
- **Panel en tiempo real** vía WebSockets
- **PWA instalable** en dispositivos móviles

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTE (Browser/PWA)                    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Admin   │  │  Logístico   │  │  Scanner (QR Camera)  │  │
│  │  Panel   │  │  Dashboard   │  │  (Online + Offline)   │  │
│  └──────────┘  └──────────────┘  └──────────────────────┘  │
│         │             │                    │                  │
│         └─────────────┼────────────────────┘                 │
│                   React + TailwindCSS                         │
│              IndexedDB (Dexie.js) + Service Worker            │
└─────────────────────────────┬───────────────────────────────┘
                               │ HTTP/WebSocket
                    ┌──────────┴──────────┐
                    │   Nginx (Reverse     │
                    │      Proxy)          │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
  ┌────────┴────────┐  ┌───────┴──────┐  ┌────────┴────────┐
  │   FastAPI       │  │   MongoDB    │  │  Twilio/SMTP    │
  │   Backend       │  │   Database   │  │  (Notif.)       │
  │   :8000         │  │   :27017     │  │  (External)     │
  └─────────────────┘  └──────────────┘  └─────────────────┘
```

---

## �� Instalación Local con Docker

### Requisitos
- Docker Desktop 4.x+
- Git

### Pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/cleangel196809/asistencia_grados_politecnico
cd asistencia_grados_politecnico

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores (opcional para prueba local)

# 3. Levantar servicios
docker-compose up -d

# 4. Inicializar base de datos con usuarios por defecto
docker-compose exec backend python init_db.py

# 5. Acceder a la aplicación
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
```

### Usuarios por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| logistico | logis123 | Logístico |
| scanner | scanner123 | Scanner |

---

## 🔧 Instalación Manual (sin Docker)

### Requisitos
- Python 3.11+
- Node.js 18+
- MongoDB 7

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copiar y editar variables de entorno
cp .env.example .env

# Inicializar BD
python init_db.py

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Configurar URL del backend
echo "REACT_APP_API_URL=http://localhost:8000" > .env
echo "REACT_APP_WS_URL=ws://localhost:8000" >> .env

# Iniciar
npm start
```

---

## ☁️ Despliegue en Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub Repo**
3. Seleccionar `cleangel196809/asistencia_grados_politecnico`
4. Agregar servicio **MongoDB** desde el Marketplace de Railway
5. En el servicio Backend, configurar:
   - **Root Directory:** `backend`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Variables de entorno: copiar desde `.env.example` y ajustar `MONGODB_URL`
6. En el servicio Frontend, configurar:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - Variable: `REACT_APP_API_URL=https://tu-backend.railway.app`
7. Ejecutar init_db: Railway Console → `python init_db.py`

---

## 🌐 Despliegue en Render

### Backend
1. [render.com](https://render.com) → **New Web Service**
2. Conectar repositorio de GitHub
3. Configurar:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Agregar variables de entorno desde `.env.example`
5. Para MongoDB: usar [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier)

### Frontend
1. **New Static Site** en Render
2. **Root Directory:** `frontend`
3. **Build Command:** `npm run build`
4. **Publish Directory:** `build`
5. Variable: `REACT_APP_API_URL=https://tu-backend.onrender.com`

---

## 🖥️ Despliegue en VPS (Ubuntu 22.04)

```bash
# 1. Instalar Docker en Ubuntu
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

# 2. Clonar repositorio
git clone https://github.com/cleangel196809/asistencia_grados_politecnico
cd asistencia_grados_politecnico

# 3. Configurar producción
cp .env.example .env.prod
nano .env.prod  # Editar con valores de producción

# 4. Levantar en producción
docker-compose -f docker-compose.prod.yml up -d

# 5. Inicializar BD
docker-compose -f docker-compose.prod.yml exec backend python init_db.py

# 6. Configurar SSL con Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com

# 7. Configurar renovación automática de SSL
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

---

## 📱 Instalación de la PWA en Dispositivo Móvil

La aplicación scanner funciona como PWA (Progressive Web App), instalable en cualquier dispositivo.

### Android (Chrome)
1. Abrir `http://tu-servidor:3000/scanner` en Chrome
2. Menú (⋮) → **"Agregar a pantalla de inicio"**
3. Confirmar instalación
4. Aparecerá como app en el launcher

### iOS (Safari)
1. Abrir en Safari: `http://tu-servidor:3000/scanner`
2. Botón compartir (□↑) → **"Agregar a pantalla de inicio"**
3. Confirmar con "Agregar"

### Características PWA
- ✅ Funciona **sin conexión** (modo offline)
- ✅ Acceso a **cámara** para escaneo QR
- ✅ **Sincronización automática** al recuperar internet
- ✅ Instalable como **app nativa** sin tienda de aplicaciones

---

## 👥 Guía de Uso por Rol

### 🔴 Administrador

1. **Crear Evento**: Menú → Eventos → "+ Crear Evento"
2. **Cargar Participantes**: Menú → Participantes → Subir Excel
   - Columnas requeridas: `No DOCUMENTO | SEDE | PROGRAMA | APELLIDOS Y NOMBRES | TEL1 | EMAIL INSTITUCIONAL | COHORTE | PROMEDIO`
3. **Generar QR**: Menú → Gestión QR → "Generar QR Masivo"
4. **Enviar QR**: WhatsApp masivo o Email masivo desde Gestión QR
5. **Reportes**: Descargar Excel de asistencia y pendientes

### 🟡 Logístico

1. **Dashboard**: Ver progreso en tiempo real
2. **Participantes**: Lista con estado de QR de cada uno
3. **Invitación Individual**: Buscar por cédula → enviar QR

### 🟢 Scanner

1. Seleccionar el evento activo
2. Descargar lista offline (opcional)
3. Escanear QR con la cámara
4. Resultado:
   - ✅ Verde: QR válido - muestra nombre y datos
   - ❌ Rojo: QR ya utilizado
   - ⚠️ Amarillo: QR no válido

---

## 🔧 Troubleshooting

### La app no carga
```bash
docker-compose logs -f frontend
docker-compose logs -f backend
```

### Error de conexión a MongoDB
```bash
docker-compose ps
docker-compose restart mongodb
```

### Cámara no funciona (escáner)
- La cámara requiere **HTTPS** en producción o `localhost` en desarrollo
- Verificar permisos de cámara en el navegador

### WhatsApp no envía
- Verificar credenciales Twilio en `.env`
- El número debe estar en el Sandbox de Twilio para pruebas
- Formato del número: `+573001234567`

### Email no llega
- Verificar configuración SMTP en `.env`
- Para Gmail: activar "Contraseñas de aplicación"
- Revisar carpeta de spam

---

## 📡 API Documentation

Con la aplicación corriendo:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

---

## 🛡️ Seguridad

- Contraseñas hasheadas con **bcrypt**
- Autenticación con **JWT** (8 horas de expiración)
- **QR de un solo uso**: una vez escaneado, no puede reutilizarse
- En producción: configurar `SECRET_KEY` con valor aleatorio largo

---

## 📄 Licencia

Politécnico Internacional © 2024. Todos los derechos reservados.
