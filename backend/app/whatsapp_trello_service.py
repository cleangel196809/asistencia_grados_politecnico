import os
from typing import Any, Dict, List

from .trello_client import TrelloClient


def _build_wa_link(phone: str, text: str) -> str:
    from urllib.parse import quote

    return f"https://wa.me/{phone}?text={quote(text)}"


def _format_description(payload: Dict[str, Any]) -> str:
    # Descripción legible para el operador
    qr_payloads = [str(x) for x in (payload.get("qr_payloads") or [])]
    phone = str(payload.get("participant_phone", ""))
    whatsapp_text = str(payload.get("whatsapp_text", ""))
    wa_link = _build_wa_link(phone, whatsapp_text) if phone else ""
    return (
        "📨 Envío WhatsApp (pendiente)\n"
        "--------------------------------\n"
        f"Nombre: {payload.get('participant_name', '')}\n"
        f"Cédula: {payload.get('participant_cedula', '')}\n"
        f"Teléfono: {phone}\n"
        "\n"
        "Enlace directo (clic para abrir WhatsApp con el mensaje listo):\n"
        + (wa_link or "Sin teléfono válido")
        + "\n\n"
        "Texto WhatsApp:\n"
        + whatsapp_text
        + "\n\n"
        "Payload QR (para auditoría):\n"
        + "\n\n".join(qr_payloads)
        + "\n"
    )


def program_whatsapp_cards_for_event(
    *,
    event: Dict[str, Any],
    participants: List[Dict[str, Any]],
    whatsapp_text_by_participant: Dict[str, str],
    qr_payloads_by_participant: Dict[str, List[str]],
) -> Dict[str, Any]:
    """Crea 1 Card por invitado en una lista Trello de estado 'Pendiente WhatsApp'."""

    client = TrelloClient()
    client.ensure_env()

    board_id = os.getenv("TRELLO_BOARD_ID") or ""
    list_id = os.getenv("TRELLO_LIST_ID_WHATSAPP_PENDING") or ""

    created: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for p in participants:
        phone_raw = p.get("phone") or ""
        phone = "".join([c for c in str(phone_raw) if c.isdigit()])
        if not phone:
            errors.append({"participant": p.get("id"), "reason": "Falta teléfono"})
            continue

        pid_raw = p.get("id")
        pid = str(pid_raw) if pid_raw is not None else ""
        whatsapp_text = whatsapp_text_by_participant.get(pid, "")
        qr_payloads = qr_payloads_by_participant.get(pid, [])

        card_name = f"WhatsApp | {p.get('cedula','')} | {p.get('name','')}"
        description = _format_description(
            {
                "participant_name": p.get("name"),
                "participant_cedula": p.get("cedula"),
                "participant_phone": phone,
                "whatsapp_text": whatsapp_text,
                "qr_payloads": qr_payloads,
                "event_id": event.get("id"),
                "event_name": event.get("name"),
            }
        )

        try:
            card = client.create_card(
                board_id=board_id,
                list_id=list_id,
                name=card_name,
                description=description,
            )
            created.append({
                "participant_id": pid,
                "card_id": card.get("id"),
                "phone": phone,
                "wa_link": _build_wa_link(phone, whatsapp_text),
            })
        except Exception as exc:
            errors.append({"participant": pid, "reason": str(exc)})

    return {
        "created": len(created),
        "errors": len(errors),
        "created_items": created,
        "error_items": errors,
    }

