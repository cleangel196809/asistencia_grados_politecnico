# Guía: envío masivo de WhatsApp usando Trello

## Cómo funciona en esta app

El sistema **no envía WhatsApp directamente** (eso requeriría una cuenta de WhatsApp Business API de pago, ej. Meta Cloud API o Twilio). En su lugar, cuando el administrador presiona **"Programar WhatsApp masivo en Trello"**:

1. El backend crea **una tarjeta (card) por invitado** en una lista de Trello ("Pendiente WhatsApp").
2. Cada tarjeta incluye: nombre, cédula, teléfono, el texto del mensaje, y un **enlace directo `https://wa.me/...`** ya armado con el mensaje.
3. Un operador (logística) abre el tablero de Trello, y por cada tarjeta hace clic en el enlace `wa.me` — esto abre WhatsApp Web o la app con el mensaje ya redactado, listo para enviar con un clic.
4. Opcionalmente, se puede automatizar el último paso con Make.com o Zapier (ver sección 4) para que el envío sea 100% automático sin intervención manual.

Este enfoque es gratuito y no requiere aprobación de Meta, pero el envío final requiere que alguien (o una automatización) haga clic en cada enlace.

## 1. Crear cuenta y tablero en Trello

1. Crea una cuenta gratuita en https://trello.com/signup (puedes usar el correo `eventospolitecnicointernacional@pi.edu.co`).
2. Crea un tablero nuevo, ej. **"Envíos WhatsApp - Grados Politécnico"**.
3. Dentro del tablero, crea una lista llamada exactamente algo identificable, ej. **"Pendiente WhatsApp"**.
   (opcional) agrega otra lista **"Enviado"** para mover las tarjetas ya procesadas manualmente.

## 2. Obtener API Key y Token de Trello

1. Con sesión iniciada, ve a https://trello.com/power-ups/admin/ o directamente a https://trello.com/app-key.
2. Copia el valor de **API Key** (es el `TRELLO_API_KEY`).
3. En la misma página, genera un **Token** (botón "Token" junto al API Key) — autoriza el acceso y copia el valor (es el `TRELLO_API_TOKEN`). Este token no expira a menos que lo revoques.

## 3. Obtener el ID del tablero y de la lista

1. Abre tu tablero en Trello desde el navegador.
2. Agrega `.json` al final de la URL del tablero y ábrelo, ej.:
   `https://trello.com/b/XXXXXXXX/mi-tablero.json`
3. Busca el campo `"id"` al inicio del JSON → es el `TRELLO_BOARD_ID`.
4. Dentro del mismo JSON, busca la sección `"lists"` y localiza el objeto cuyo `"name"` coincide con tu lista ("Pendiente WhatsApp"). Su `"id"` es el `TRELLO_LIST_ID_WHATSAPP_PENDING`.

   Alternativa más simple: instala la extensión "Trello Card Number Copy" o usa el atajo `w` (mostrar detalles del board) dentro de Trello, que expone estos IDs sin editar la URL.

## 4. Configurar las variables de entorno del backend

En `backend/.env` (cópialo desde `backend/.env.example`):

```
TRELLO_API_KEY=tu_api_key
TRELLO_API_TOKEN=tu_token
TRELLO_BOARD_ID=id_del_tablero
TRELLO_LIST_ID_WHATSAPP_PENDING=id_de_la_lista
```

En producción (Render), agrega estas mismas variables en el panel "Environment" del servicio.

## 5. Procesar los envíos (manual)

1. En el panel admin (paso 4 "Invitaciones"), escribe el mensaje base y presiona **"Programar WhatsApp masivo en Trello"**.
2. Abre tu tablero de Trello — verás una tarjeta por cada invitado con teléfono válido.
3. Abre cada tarjeta, haz clic en el enlace `wa.me` de la descripción → se abre WhatsApp con el mensaje listo → presiona enviar.
4. Mueve la tarjeta a la lista "Enviado" (o agrégale una etiqueta) para llevar control de quién falta.

## 6. Automatizar el envío final (opcional, recomendado para eventos grandes)

Si quieres que el envío sea automático (sin clics manuales), usa una automatización externa que "escuche" nuevas tarjetas en la lista y dispare el envío real vía una API de WhatsApp Business:

- **Make.com** (antes Integromat): módulo "Trello → Watch New Cards" conectado a un módulo de WhatsApp Business (Meta Cloud API) o a Twilio WhatsApp API.
- **Zapier**: trigger "New Card in List" (Trello) → acción de envío WhatsApp (requiere una integración de WhatsApp Business habilitada).
- **Twilio WhatsApp API**: requiere registrar un número de WhatsApp Business y aprobar plantillas de mensaje ante Meta; tiene costo por mensaje pero el envío es 100% automático y auditable.

Esta automatización es opcional: el flujo manual con enlaces `wa.me` ya cumple el requisito de "envío masivo por WhatsApp" sin costos adicionales ni aprobaciones de Meta.
