import os
import re
from typing import Any, Dict, List

import requests

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"


def _twilio_config() -> Dict[str, Any]:
    return {
        "account_sid": os.getenv("TWILIO_ACCOUNT_SID", ""),
        "auth_token": os.getenv("TWILIO_AUTH_TOKEN", ""),
        # Numero del Sandbox de WhatsApp por defecto; se puede cambiar cuando
        # se tenga un remitente de WhatsApp Business propio y aprobado.
        "from_number": os.getenv("TWILIO_WHATSAPP_FROM", "+14155238886"),
    }


def is_twilio_configured() -> bool:
    cfg = _twilio_config()
    return bool(cfg["account_sid"] and cfg["auth_token"])


def _normalize_phone(raw_phone: str) -> str:
    """Deja solo digitos y antepone el indicativo de Colombia (57) si el
    numero no lo trae ya (asume celular local de 10 digitos)."""
    digits = re.sub(r"\D", "", raw_phone or "")
    if not digits:
        return ""
    if digits.startswith("57") and len(digits) > 10:
        return digits
    if len(digits) == 10:
        return "57" + digits
    return digits


def send_whatsapp_message(*, to_phone: str, body_text: str) -> Dict[str, Any]:
    if not to_phone:
        return {"sent": False, "reason": "Falta telefono del destinatario"}

    cfg = _twilio_config()
    if not is_twilio_configured():
        return {"sent": False, "reason": "Twilio no configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN)"}

    normalized = _normalize_phone(to_phone)
    if not normalized:
        return {"sent": False, "reason": "Telefono invalido"}

    try:
        resp = requests.post(
            f"{TWILIO_API_BASE}/Accounts/{cfg['account_sid']}/Messages.json",
            auth=(cfg["account_sid"], cfg["auth_token"]),
            data={
                "From": f"whatsapp:{cfg['from_number']}",
                "To": f"whatsapp:+{normalized}",
                "Body": body_text,
            },
            timeout=20,
        )
        data = resp.json()
        if resp.status_code >= 300:
            return {
                "sent": False,
                "reason": data.get("message") or f"Twilio error {data.get('code')}",
                "twilio_code": data.get("code"),
            }
        if data.get("error_code"):
            return {"sent": False, "reason": data.get("error_message") or f"Twilio error {data['error_code']}", "twilio_code": data["error_code"]}
        return {"sent": True, "message_sid": data.get("sid"), "status": data.get("status")}
    except Exception as exc:  # pragma: no cover - dependiente de red/credenciales
        return {"sent": False, "reason": str(exc)}


def send_bulk_whatsapp_messages(*, recipients: List[Dict[str, Any]]) -> Dict[str, Any]:
    """recipients: [{"participant_id", "to_phone", "body_text"}]"""
    if not is_twilio_configured():
        return {
            "configured": False,
            "sent": 0,
            "errors": len(recipients),
            "results": [
                {"participant_id": r.get("participant_id"), "sent": False, "reason": "Twilio no configurado"}
                for r in recipients
            ],
        }

    results = []
    sent_count = 0
    for r in recipients:
        outcome = send_whatsapp_message(to_phone=r.get("to_phone", ""), body_text=r.get("body_text", ""))
        if outcome.get("sent"):
            sent_count += 1
        results.append({"participant_id": r.get("participant_id"), **outcome})

    return {
        "configured": True,
        "sent": sent_count,
        "errors": len(recipients) - sent_count,
        "results": results,
    }
