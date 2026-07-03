import base64
import os
from typing import Any, Dict, List, Optional

from .trello_client import TrelloClient


def _decode_data_uri(data_uri: str) -> bytes:
    if data_uri.startswith("data:image"):
        return base64.b64decode(data_uri.split(",", 1)[1])
    return base64.b64decode(data_uri)


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
    invitation_images_by_participant: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """Crea 1 Card por invitado en una lista Trello de estado 'Pendiente WhatsApp'.

    invitation_images_by_participant: data-URIs (PNG) de la invitación ya armada
    (nombre + QR sobre la plantilla), una por boleta. Se suben como adjuntos de
    la tarjeta para que quien procese el envío las tenga listas para reenviar
    por WhatsApp Web/App junto con el enlace wa.me.
    """

    client = TrelloClient()
    client.ensure_env()

    board_id = os.getenv("TRELLO_BOARD_ID") or ""
    list_id = os.getenv("TRELLO_LIST_ID_WHATSAPP_PENDING") or ""
    invitation_images_by_participant = invitation_images_by_participant or {}

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
        invitation_images = invitation_images_by_participant.get(pid, [])

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
            card_id = card.get("id")

            attachments_uploaded = 0
            for index, image_data_uri in enumerate(invitation_images, start=1):
                try:
                    client.add_attachment(
                        card_id=card_id,
                        file_bytes=_decode_data_uri(image_data_uri),
                        filename=f"invitacion_{index}.png",
                    )
                    attachments_uploaded += 1
                except Exception:
                    pass  # el envio del mensaje/card ya se logro; el adjunto es un plus

            created.append({
                "participant_id": pid,
                "card_id": card_id,
                "phone": phone,
                "wa_link": _build_wa_link(phone, whatsapp_text),
                "attachments_uploaded": attachments_uploaded,
            })
        except Exception as exc:
            errors.append({"participant": pid, "reason": str(exc)})

    return {
        "created": len(created),
        "errors": len(errors),
        "created_items": created,
        "error_items": errors,
    }

