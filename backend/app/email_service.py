import base64
import os
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, List


def _smtp_config() -> Dict[str, Any]:
    return {
        "host": os.getenv("EMAIL_SMTP_HOST", ""),
        "port": int(os.getenv("EMAIL_SMTP_PORT", "587")),
        "user": os.getenv("EMAIL_SMTP_USER", ""),
        "password": os.getenv("EMAIL_SMTP_PASSWORD", ""),
        "from_address": os.getenv("EMAIL_FROM_ADDRESS", "eventospolitecnicointernacional@pi.edu.co"),
        "from_name": os.getenv("EMAIL_FROM_NAME", "Eventos Politécnico Internacional"),
        "use_tls": os.getenv("EMAIL_USE_TLS", "true").lower() != "false",
    }


def is_smtp_configured() -> bool:
    cfg = _smtp_config()
    return bool(cfg["host"] and cfg["user"] and cfg["password"])


def _build_message(*, to_address: str, subject: str, body_text: str, qr_images: List[Dict[str, str]], cfg: Dict[str, Any]) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{cfg['from_name']} <{cfg['from_address']}>"
    message["To"] = to_address
    message.set_content(body_text)

    for index, qr_image in enumerate(qr_images, start=1):
        data_url = qr_image.get("image", "")
        if not data_url.startswith("data:image/png;base64,"):
            continue
        image_bytes = base64.b64decode(data_url.split(",", 1)[1])
        message.add_attachment(
            image_bytes,
            maintype="image",
            subtype="png",
            filename=f"invitacion_{index}.png",
        )
    return message


def send_invitation_email(
    *,
    to_address: str,
    subject: str,
    body_text: str,
    qr_images: List[Dict[str, str]],
) -> Dict[str, Any]:
    if not to_address:
        return {"sent": False, "reason": "Falta correo del destinatario"}

    cfg = _smtp_config()
    if not is_smtp_configured():
        return {"sent": False, "reason": "SMTP no configurado (EMAIL_SMTP_HOST/USER/PASSWORD)"}

    message = _build_message(to_address=to_address, subject=subject, body_text=body_text, qr_images=qr_images, cfg=cfg)

    try:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as server:
            if cfg["use_tls"]:
                server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(message)
        return {"sent": True}
    except Exception as exc:  # pragma: no cover - network/credentials dependent
        return {"sent": False, "reason": str(exc)}


def send_bulk_invitation_emails(
    *,
    recipients: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """recipients: [{"to_address", "subject", "body_text", "qr_images", "participant_id"}]"""
    if not is_smtp_configured():
        return {
            "configured": False,
            "sent": 0,
            "errors": len(recipients),
            "results": [
                {"participant_id": r.get("participant_id"), "sent": False, "reason": "SMTP no configurado (EMAIL_SMTP_HOST/USER/PASSWORD)"}
                for r in recipients
            ],
        }

    results = []
    sent_count = 0
    for r in recipients:
        outcome = send_invitation_email(
            to_address=r.get("to_address", ""),
            subject=r.get("subject", ""),
            body_text=r.get("body_text", ""),
            qr_images=r.get("qr_images", []),
        )
        if outcome.get("sent"):
            sent_count += 1
        results.append({"participant_id": r.get("participant_id"), **outcome})

    return {
        "configured": True,
        "sent": sent_count,
        "errors": len(recipients) - sent_count,
        "results": results,
    }
