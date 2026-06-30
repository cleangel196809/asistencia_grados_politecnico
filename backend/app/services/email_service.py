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
    numero_boleta: int,
    total_boletas: int,
    fecha: str,
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
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e3a5f; color: white; padding: 20px; text-align: center;">
                <h1>Politécnico Internacional</h1>
                <h2>Ceremonia de Grado</h2>
            </div>
            <div style="padding: 20px;">
                <p>Estimado/a <strong>{nombre}</strong>,</p>
                <p>Nos complace invitarle a la Ceremonia de Grado del Politécnico Internacional.</p>
                <p><strong>Fecha:</strong> {fecha}</p>
                <p><strong>Lugar:</strong> {lugar}</p>
                <p><strong>Boleta:</strong> #{numero_boleta} de {total_boletas}</p>
                <p>Presente este código QR en la entrada:</p>
                <div style="text-align: center; margin: 20px 0;">
                    <img src="cid:qrcode" alt="Código QR" style="width: 200px; height: 200px;"/>
                </div>
                <p style="color: #666; font-size: 12px;">Este código QR es único e intransferible. No lo comparta.</p>
                <p style="color: #666; font-size: 12px;">Código: {qr_id}</p>
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
            **{"password": password},
            use_tls=False,
            start_tls=True,
        )

        return True
    except Exception as exc:
        print(f"Email error: {exc}")
        return False
