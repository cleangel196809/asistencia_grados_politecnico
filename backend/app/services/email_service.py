import base64
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from ..config import settings


async def send_email_qr(
    to_email: str,
    from_email: Optional[str],
    smtp_config: Optional[dict],
    nombre: str,
    event_name: str,
    numero_boleta: int,
    total_boletas: int,
    fecha: str,
    horario: str,
    lugar: str,
    qr_image_b64: str,
    qr_id: str,
) -> bool:
    """Send QR code via email."""
    try:
        if not to_email:
            return False

        sender = from_email or settings.MAIL_FROM or "noreply@politecnico.edu.co"

        if smtp_config:
            host = smtp_config.get("host", settings.MAIL_SERVER)
            port = smtp_config.get("port", settings.MAIL_PORT)
            username = smtp_config.get("username", settings.MAIL_USERNAME)
            password = smtp_config.get("password", settings.MAIL_PASSWORD)
        else:
            host = settings.MAIL_SERVER
            port = settings.MAIL_PORT
            username = settings.MAIL_USERNAME
            password = settings.MAIL_PASSWORD

        msg = MIMEMultipart("related")
        msg["Subject"] = "Invitación Ceremonia de Grado - Politécnico Internacional"
        msg["From"] = sender
        msg["To"] = to_email

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f5f7fb;">
            <div style="background: #1e3a5f; color: white; padding: 24px; text-align: center; border-radius: 16px 16px 0 0;">
                <h1 style="margin: 0;">Politécnico Internacional</h1>
                <p style="margin: 8px 0 0;">Invitación oficial de grado</p>
            </div>
            <div style="padding: 24px; background: white; border: 1px solid #dbe4f0; border-top: 0; border-radius: 0 0 16px 16px;">
                <p style="font-size: 28px; font-weight: bold; color: #1e3a5f; margin: 0 0 16px;">{nombre}</p>
                <p style="margin: 0 0 16px;">¡Bienvenido! Nos complace invitarte al evento de grado del Politécnico Internacional.</p>
                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                    <p style="margin: 0 0 8px;"><strong>Evento:</strong> {event_name}</p>
                    <p style="margin: 0 0 8px;"><strong>Fecha:</strong> {fecha}</p>
                    <p style="margin: 0 0 8px;"><strong>Hora:</strong> {horario}</p>
                    <p style="margin: 0;"><strong>Ubicación:</strong> {lugar}</p>
                </div>
                <p style="font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 16px;">Boleta {numero_boleta} de {total_boletas}</p>
                <div style="text-align: center; margin: 20px 0;">
                    <img src="cid:qrcode" alt="Código QR" style="width: 220px; height: 220px;"/>
                </div>
                <p style="text-align: center; margin: 0 0 20px;">Presenta este código al ingreso para validar tu invitación.</p>
                <div style="font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <p style="margin: 0 0 4px;">Código interno: {qr_id}</p>
                    <p style="margin: 0;">Presente este código en la entrada. Uso único.</p>
                </div>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(html_content, "html"))

        if qr_image_b64:
            img_data = base64.b64decode(qr_image_b64)
            img = MIMEImage(img_data)
            img.add_header("Content-ID", "<qrcode>")
            msg.attach(img)

        if not username or not password:
            return False

        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=username,
            password=password,
            use_tls=False,
                        start_tls=True,
        )

        return True
    except Exception as exc:
        print(f"Email error: {exc}")
        return False
