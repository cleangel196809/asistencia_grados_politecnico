from typing import Optional

from ..config import settings


async def send_whatsapp_qr(
    to_number: str,
    from_number: Optional[str],
    nombre: str,
    numero_boleta: int,
    total_boletas: int,
    fecha: str,
    lugar: str,
    qr_image_b64: str,
    qr_id: str,
) -> bool:
    """Send QR code via WhatsApp using Twilio."""
    try:
        if not to_number:
            return False

        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            print("Twilio credentials not configured")
            return False

        from twilio.rest import Client

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        from_wa = from_number or settings.TWILIO_WHATSAPP_FROM
        if not from_wa.startswith("whatsapp:"):
            from_wa = f"whatsapp:{from_wa}"

        to_wa = to_number
        if not to_wa.startswith("whatsapp:"):
            to_wa = f"whatsapp:{to_wa}"

        message_body = (
            f"Hola {nombre}, aquí está tu invitación para la Ceremonia de Grado del "
            f"Politécnico Internacional.\nBoleta #{numero_boleta} de {total_boletas}\n"
            f"Fecha: {fecha}\nLugar: {lugar}\nCódigo: {qr_id}"
        )

        media_url = f"{settings.BACKEND_URL}/api/qr/image/{qr_id}"

        message = client.messages.create(
            body=message_body,
            from_=from_wa,
            to=to_wa,
            media_url=[media_url],
        )

        return message.sid is not None
    except Exception as exc:
        print(f"WhatsApp error: {exc}")
        return False
