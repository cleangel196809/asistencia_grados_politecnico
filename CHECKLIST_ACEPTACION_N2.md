# Checklist de Criterios de Aceptacion N2

Fecha: 2026-07-01
Proyecto: attendance-system
Ambiente validado:
- Frontend: http://127.0.0.1:5174
- Backend: http://127.0.0.1:8000

## 1. Criterios funcionales (Administrador)

- [x] Login de administrador exitoso.
- [x] Se muestra el bloque "Operaciones masivas (Administrador)".
- [x] Creacion masiva por texto: prevalidacion de filas validas/invalidas.
- [x] Creacion masiva: reporte final de creadas/omitidas.
- [x] Generacion masiva de QR por evento.
- [x] Envio masivo por WhatsApp preparado con QR.
- [x] Envio masivo por email preparado con QR.
- [x] Importacion CSV de invitaciones masivas (flujo habilitado con evento seleccionado).

## 2. Criterios funcionales (Logistico)

- [x] Login logistico exitoso.
- [x] Vista de panel logistico cargada.
- [x] Busqueda por cedula funcional.
- [x] Resultado de invitado mostrado con estado de ingreso.

## 3. Criterios funcionales (Scanner)

- [x] Login scanner exitoso.
- [x] Vista de scanner cargada con evento activo.
- [x] Entrada manual de payload QR valida registra ingreso.
- [x] Reescaneo del mismo QR detecta duplicado.
- [x] Contadores de escaneo se actualizan (usados/validos recientes).

## 4. Validaciones tecnicas

- [x] Endpoint health responde OK.
- [x] Endpoint login responde OK.
- [x] Endpoint QR bulk responde OK.
- [x] Frontend sin errores de sintaxis en App.jsx tras ajustes.
- [x] Backend sin errores de sintaxis en main.py tras ajustes.

## 5. Ajustes aplicados durante la validacion

- [x] Correccion de colision de rutas FastAPI para QR masivo:
  - Se priorizo la ruta estatica /events/{event_id}/qr/bulk antes de /events/{event_id}/qr/{participant_id}.
  - Archivo: backend/app/main.py
- [x] Robustez en frontend para operaciones masivas:
  - Manejo de errores en generateBulkQr, sendAllWhatsApp, sendAllEmail.
  - Uso de finally para liberar estado de boton de generacion masiva.
  - Archivo: frontend/src/App.jsx

## 6. Riesgos / observaciones no bloqueantes

- [!] En el entorno de prueba del navegador integrado hubo denegacion de permisos de camara (NotAllowedError).
- [x] Mitigacion validada: flujo de entrada manual del QR funciona correctamente para registro y deteccion de duplicados.

## 7. Decision de cierre

Estado recomendado: APROBADO PARA N2 (con observacion de permisos de camara del entorno de prueba, no del sistema).

## 8. Evidencia resumida

- Admin:
  - Operaciones masivas visibles y funcionales.
  - QR masivo generado y envios masivos preparados.
- Logistico:
  - Consulta por cedula con resultado correcto.
- Scanner:
  - Registro valido + deteccion de duplicado en segundo intento.
