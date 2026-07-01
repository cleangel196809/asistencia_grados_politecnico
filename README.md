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

## 🚀 Instalación local (paso a paso)

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
python init_db.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd ../frontend
npm install
echo "REACT_APP_API_URL=http://localhost:8000" > .env
echo "REACT_APP_WS_URL=ws://localhost:8000" >> .env
npm start
```

---

## 👤 Usuarios por defecto

| Rol | Usuario | Contraseña |
|-----|---------|-----------|
| admin | admin | admin123 |
| logistico | logistico | logis123 |
| scanner | scanner | scanner123 |

---

## 🐳 Despliegue con Docker

```bash
docker-compose up --build
docker-compose -f docker-compose.prod.yml up --build
```

---

## ☁️ Variables de entorno requeridas

```env
MONGO_URL=mongodb://mongo:27017
DB_NAME=politecnico_asistencia
SECRET_KEY=your-secret-key-here
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=eventospolitecnicointernacional@pi.edu.co
SMTP_PASSWORD=
```

---

## ☁️ Despliegue en la nube

### 1. Railway

1. Crear proyecto nuevo en Railway y conectar el repositorio.
2. Agregar un servicio MongoDB desde el marketplace.
3. Crear servicio Backend con **Root Directory** `backend` y comando `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Crear servicio Frontend con **Root Directory** `frontend` y `npm run build`.
5. Configurar variables del backend con los valores de `.env.example`, ajustando `MONGO_URL` al servicio MongoDB de Railway.
6. Configurar `REACT_APP_API_URL` y `REACT_APP_WS_URL` en el frontend apuntando al backend publicado.
7. Ejecutar `python init_db.py` en la consola del backend para sembrar usuarios e índices.

### 2. DigitalOcean Droplet con Docker

1. Crear un Droplet Ubuntu 22.04 con puertos 80/443 abiertos.
2. Instalar Docker y Docker Compose.
3. Clonar el repositorio en el servidor y crear `.env.prod` a partir de `.env.example`.
4. Ajustar `DOMAIN`, `MONGO_URL`, `SECRET_KEY`, Twilio y SMTP.
5. Ejecutar `docker-compose -f docker-compose.prod.yml up --build -d`.
6. Inicializar MongoDB con `docker-compose -f docker-compose.prod.yml exec backend python init_db.py`.
7. Configurar DNS del dominio hacia la IP del Droplet y montar certificados TLS en Nginx.

### 3. AWS EC2 con Docker Compose

1. Crear una instancia EC2 Ubuntu con Security Group permitiendo 22, 80 y 443.
2. Instalar Docker, Docker Compose y Git.
3. Clonar el repositorio y copiar `.env.example` a `.env.prod`.
4. Configurar variables del backend y URLs públicas del frontend.
5. Levantar la plataforma con `docker-compose -f docker-compose.prod.yml up --build -d`.
6. Ejecutar `docker-compose -f docker-compose.prod.yml exec backend python init_db.py`.
7. Asociar Elastic IP, apuntar el dominio y configurar TLS/certificados para Nginx.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker
docker-compose -f docker-compose.prod.yml up --build -d
docker-compose -f docker-compose.prod.yml exec backend python init_db.py
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
   - Columnas requeridas: `No | DOCUMENTO | SEDE | PROGRAMA | APELLIDOS Y NOMBRES | TEL1 | EMAIL INSTITUCIONAL | COHORTE | PROMEDIO`
3. **Generar QR**: Menú → Gestión QR → "Generar QR Masivo"
4. **Enviar QR**: WhatsApp masivo o Email masivo desde Gestión QR
5. **Reportes**: Descargar informe final con hojas de asistidos y pendientes

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
