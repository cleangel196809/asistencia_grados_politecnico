import base64
import io
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Debe correr antes de importar app.database/app.security, que leen
# variables de entorno (MONGO_URI, JWT_SECRET_KEY, EMAIL_*, etc.) al importarse.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import pandas as pd
import qrcode
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.auth import get_current_user, require_role
from app.database import store
from app.email_service import is_smtp_configured, send_bulk_invitation_emails, send_invitation_email
from app.invitation_service import (
    build_invitations_document,
    compose_invitation_data_uri,
    is_template_available,
    load_layout,
    save_layout,
)
from app.security import create_access_token
from app.whatsapp_trello_service import program_whatsapp_cards_for_event


app = FastAPI(title="Attendance Control API", version="1.0.0")
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connected_clients: set[WebSocket] = set()


class EmailProgramRequest(BaseModel):
    event_id: str
    subject: str = ""
    body_text: str = ""
    participant_ids: Optional[List[str]] = None


class EmailIndividualRequest(BaseModel):
    event_id: str
    participant_id: str
    subject: str = ""
    body_text: str = ""


class WhatsAppIndividualRequest(BaseModel):
    event_id: str
    participant_id: str
    whatsapp_text: str = ""


def _build_whatsapp_program_inputs(event_id: str, participants: List[Dict[str, Any]], whatsapp_text: str):
    """Arma los payloads QR y las imagenes de invitacion ya compuestas para Trello."""
    layout = load_layout() if is_template_available() else None
    qr_payloads_by_participant: Dict[str, List[str]] = {}
    invitation_images_by_participant: Dict[str, List[str]] = {}
    whatsapp_text_by_participant: Dict[str, str] = {}

    for p in participants:
        pid = str(p.get("id"))
        attachments = build_invitation_attachments(event_id, p, layout=layout)
        qr_payloads_by_participant[pid] = [t.get("payload") for t in attachments if t.get("payload")]
        invitation_images_by_participant[pid] = [t.get("image") for t in attachments if t.get("image")]
        whatsapp_text_by_participant[pid] = whatsapp_text

    return qr_payloads_by_participant, invitation_images_by_participant, whatsapp_text_by_participant


@app.post("/invitations/whatsapp/trello/program")
def program_whatsapp_trello(
    event_id: str,
    whatsapp_text: str = "",
    participant_ids: Optional[List[str]] = None,
    current_user: dict = Depends(require_role("ADMIN")),
):
    """Programa envío WhatsApp masivo creando una Card por invitado en Trello, con la invitación armada adjunta."""

    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(event_id)
    if participant_ids:
        participant_ids_set = set(participant_ids)
        participants = [p for p in participants if p.get("id") in participant_ids_set]

    qr_payloads_by_participant, invitation_images_by_participant, whatsapp_text_by_participant = (
        _build_whatsapp_program_inputs(event_id, participants, whatsapp_text)
    )

    try:
        result = program_whatsapp_cards_for_event(
            event=event,
            participants=participants,
            whatsapp_text_by_participant=whatsapp_text_by_participant,
            qr_payloads_by_participant=qr_payloads_by_participant,
            invitation_images_by_participant=invitation_images_by_participant,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    for item in result.get("created_items", []):
        store.increment_participant_send_count(item["participant_id"], "whatsapp")
    return result


@app.post("/invitations/whatsapp/trello/individual")
def program_whatsapp_trello_individual(
    body: WhatsAppIndividualRequest,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    """Crea una sola Card de WhatsApp en Trello (con la invitación adjunta) para un invitado."""

    event = store.get_event(body.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant = store.get_participant(body.participant_id)
    if not participant or participant.get("event_id") != body.event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    qr_payloads_by_participant, invitation_images_by_participant, whatsapp_text_by_participant = (
        _build_whatsapp_program_inputs(body.event_id, [participant], body.whatsapp_text)
    )

    try:
        result = program_whatsapp_cards_for_event(
            event=event,
            participants=[participant],
            whatsapp_text_by_participant=whatsapp_text_by_participant,
            qr_payloads_by_participant=qr_payloads_by_participant,
            invitation_images_by_participant=invitation_images_by_participant,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    for item in result.get("created_items", []):
        store.increment_participant_send_count(item["participant_id"], "whatsapp")
    return result


@app.get("/invitations/email/status")
def email_status(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    return {"configured": is_smtp_configured()}


@app.post("/invitations/email/program")
def program_email_bulk(body: EmailProgramRequest, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    """Envía correo real (SMTP) con QR adjunto a todos los invitados del evento (o a un subconjunto)."""

    event = store.get_event(body.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(body.event_id)
    if body.participant_ids:
        participant_ids_set = set(body.participant_ids)
        participants = [p for p in participants if p.get("id") in participant_ids_set]

    subject = body.subject or f"Invitación a {event.get('name', 'evento')}"
    layout = load_layout()
    recipients = []
    for p in participants:
        if not p.get("email"):
            continue
        attachments = build_invitation_attachments(body.event_id, p, layout=layout)
        ticket_word = "invitación" if len(attachments) == 1 else "invitaciones"
        body_text = (
            f"{body.body_text}\n\n"
            f"Hola {p.get('name', '')}, te invitamos al evento {event.get('name', '')} "
            f"en {event.get('location', '')} el {event.get('date', '')}.\n\n"
            f"Adjuntamos tu(s) {len(attachments)} {ticket_word} de ingreso, cada una con su código QR único."
        ).strip()
        recipients.append(
            {
                "participant_id": p.get("id"),
                "to_address": p.get("email"),
                "subject": subject,
                "body_text": body_text,
                "qr_images": attachments,
            }
        )

    result = send_bulk_invitation_emails(recipients=recipients)
    for item in result.get("results", []):
        if item.get("sent") and item.get("participant_id"):
            store.increment_participant_send_count(item["participant_id"], "email")
    return result


@app.post("/invitations/email/individual")
def send_email_individual(
    body: EmailIndividualRequest,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    """Envía correo real (SMTP) con QR adjunto a un único invitado."""

    event = store.get_event(body.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant = store.get_participant(body.participant_id)
    if not participant or participant.get("event_id") != body.event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    attachments = build_invitation_attachments(body.event_id, participant)
    subject = body.subject or f"Invitación a {event.get('name', 'evento')}"
    ticket_word = "invitación" if len(attachments) == 1 else "invitaciones"
    body_text = (
        f"{body.body_text}\n\n"
        f"Hola {participant.get('name', '')}, te invitamos al evento {event.get('name', '')} "
        f"en {event.get('location', '')} el {event.get('date', '')}.\n\n"
        f"Adjuntamos tu(s) {len(attachments)} {ticket_word} de ingreso, cada una con su código QR único."
    ).strip()

    result = send_invitation_email(
        to_address=participant.get("email", ""),
        subject=subject,
        body_text=body_text,
        qr_images=attachments,
    )
    if result.get("sent"):
        store.increment_participant_send_count(participant["id"], "email")
    return result


TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "uploads"
TEMPLATE_FILE = TEMPLATE_DIR / "invitation_template.pdf"


class EventCreate(BaseModel):
    name: str
    date: str
    location: str
    schedule: Optional[str] = ""
    capacity: int
    mode: str = "ONLINE"
    tickets_per_participant: int = 1


class ParticipantCreate(BaseModel):
    event_id: str
    name: str
    cedula: str
    email: str
    phone: str
    ticket_count: int = 1
    sede: Optional[str] = ""
    programa: Optional[str] = ""
    cohorte: Optional[str] = ""
    promedio: Optional[str] = ""


class AttendanceScan(BaseModel):
    event_id: str
    payload: str
    source: str = "online"


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = Field(..., pattern="^(ADMIN|LOGISTICO|SCANNER)$")


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(ADMIN|LOGISTICO|SCANNER)$")


class UserLogin(BaseModel):
    username: str
    password: str
    role: Optional[str] = None


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "mode": store.mode}


@app.get("/events")
def list_events(current_user: dict = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return store.list_events()


@app.post("/events", response_model=Dict[str, Any])
def create_event(body: EventCreate, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    event = store.create_event(body.model_dump())
    return event


@app.put("/events/{event_id}")
def update_event(
    event_id: str,
    body: EventCreate,
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    updated = store.update_event(event_id, body.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Event not found")
    return updated


@app.delete("/events/{event_id}")
def delete_event(event_id: str, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    deleted = store.delete_event(event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"deleted": True}


@app.get("/events/{event_id}/participants")
def list_participants(event_id: str, current_user: dict = Depends(get_current_user)) -> List[Dict[str, Any]]:
    participants = store.list_participants(event_id)
    attendances = store.list_attendances(event_id)
    participant_map = {}
    for attendance in attendances:
        pid = attendance.get("participant_id")
        if pid not in participant_map:
            participant_map[pid] = []
        participant_map[pid].append(attendance)

    enriched = []
    for participant in participants:
        used = len(participant_map.get(participant["id"], []))
        pending = max(0, participant.get("ticket_count", 1) - used)
        enriched.append({**participant, "used_qr_count": used, "pending_qr_count": pending})
    return enriched


@app.post("/participants")
def create_participant(
    body: ParticipantCreate,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    participant = store.create_participant(body.model_dump())
    return participant


@app.get("/participants/search")
def search_participants(
    cedula: str,
    event_id: Optional[str] = None,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> List[Dict[str, Any]]:
    return store.search_participants(cedula, event_id)


@app.put("/participants/{participant_id}")
def update_participant(
    participant_id: str,
    body: ParticipantCreate,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    updated = store.update_participant(participant_id, body.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Participant not found")
    return updated


@app.delete("/participants/{participant_id}")
def delete_participant(participant_id: str, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    deleted = store.delete_participant(participant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {"deleted": True}


@app.post("/participants/import")
async def import_participants(
    event_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files are allowed")
    df = pd.read_excel(file.file)
    expected = [
        "no",
        "documento",
        "sede",
        "programa",
        "apellidos y nombres",
        "tel1",
        "email institucional",
        "cohorte",
        "promedio",
    ]
    columns = [c.lower().strip() for c in df.columns]
    if not all(column in columns for column in expected):
        raise HTTPException(
            status_code=400,
            detail="The Excel file must include the columns: No, DOCUMENTO, SEDE, PROGRAMA, APELLIDOS Y NOMBRES, TEL1, EMAIL INSTITUCIONAL, COHORTE, PROMEDIO",
        )
    imported = []
    event = store.get_event(event_id)
    default_ticket_count = event.get("tickets_per_participant", 1) if event else 1
    for _, row in df.iterrows():
        participant = {
            "event_id": event_id,
            "name": str(row.get("apellidos y nombres") or row.get("APELLIDOS Y NOMBRES") or ""),
            "cedula": str(row.get("documento") or row.get("DOCUMENTO") or ""),
            "email": str(row.get("email institucional") or row.get("EMAIL INSTITUCIONAL") or ""),
            "phone": str(row.get("tel1") or row.get("TEL1") or ""),
            "programa": str(row.get("programa") or row.get("PROGRAMA") or ""),
            "sede": str(row.get("sede") or row.get("SEDE") or ""),
            "cohorte": str(row.get("cohorte") or row.get("COHORTE") or ""),
            "promedio": str(row.get("promedio") or row.get("PROMEDIO") or ""),
            "ticket_count": default_ticket_count,
            "created_at": datetime.utcnow().isoformat(),
        }
        imported.append(store.create_participant(participant))
    return {"imported": len(imported)}


@app.post("/invitations/template")
async def upload_invitation_template(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="PDF file is empty")

    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATE_FILE.write_bytes(content)
    return {
        "uploaded": True,
        "filename": file.filename,
        "download_url": "/invitations/template/download",
        "size_bytes": len(content),
    }


@app.get("/invitations/template")
def get_invitation_template_status(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    exists = TEMPLATE_FILE.exists()
    return {
        "exists": exists,
        "size_bytes": TEMPLATE_FILE.stat().st_size if exists else 0,
        "download_url": "/invitations/template/download" if exists else None,
    }


class InvitationLayoutName(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    font_size: Optional[int] = None
    max_width: Optional[float] = None
    color: Optional[str] = None


class InvitationLayoutQr(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    size: Optional[float] = None


class InvitationLayoutUpdate(BaseModel):
    name: Optional[InvitationLayoutName] = None
    qr: Optional[InvitationLayoutQr] = None


@app.get("/invitations/template/layout")
def get_invitation_layout(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    return load_layout()


@app.put("/invitations/template/layout")
def update_invitation_layout(
    body: InvitationLayoutUpdate,
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    return save_layout(body.model_dump(exclude_none=True))


@app.get("/invitations/template/preview")
def preview_invitation_layout(
    name: str = "Nombre de ejemplo",
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    if not is_template_available():
        raise HTTPException(status_code=404, detail="No hay plantilla PDF cargada")
    demo_qr = qrcode.make(json.dumps({"preview": True}))
    buf = io.BytesIO()
    demo_qr.save(buf, format="PNG")
    demo_qr_data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    try:
        image = compose_invitation_data_uri(participant_name=name, qr_image_data_uri=demo_qr_data_uri)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"image": image}


@app.get("/invitations/template/download")
def download_invitation_template() -> FileResponse:
    # Sin auth a propósito: el frontend abre esta URL con window.open()/enlace
    # directo, que no puede enviar el header Authorization. El PDF es solo la
    # plantilla institucional de marca, no contiene datos de invitados.
    if not TEMPLATE_FILE.exists():
        raise HTTPException(status_code=404, detail="Invitation template not found")
    return FileResponse(
        TEMPLATE_FILE,
        media_type="application/pdf",
        filename="plantilla_invitaciones.pdf",
    )


@app.post("/login")
def login_user(body: UserLogin) -> Dict[str, Any]:
    user = store.validate_user(body.username, body.password, body.role)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user["username"],
        "role": user["role"],
    }


@app.get("/users")
def list_users(current_user: dict = Depends(require_role("ADMIN"))) -> List[Dict[str, Any]]:
    return store.list_users()


@app.delete("/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    deleted = store.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


@app.post("/users")
def create_user(body: UserCreate, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    try:
        user = store.create_user(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


@app.put("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_role("ADMIN")),
) -> Dict[str, Any]:
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = store.update_user(user_id, changes)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


def build_qr_tickets(event_id: str, participant: Dict[str, Any]) -> List[Dict[str, Any]]:
    tickets = []
    count = max(1, participant.get("ticket_count", 1))
    for index in range(count):
        payload = json.dumps(
            {
                "event_id": event_id,
                "participant_id": participant["id"],
                "cedula": participant.get("cedula"),
                "ticket_index": index + 1,
                "ticket_count": count,
                "token": str(uuid.uuid4()),
            }
        )
        qr = qrcode.make(payload)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        image_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        tickets.append({"payload": payload, "image": f"data:image/png;base64,{image_b64}", "index": index + 1})
    return tickets


def build_invitation_attachments(
    event_id: str,
    participant: Dict[str, Any],
    layout: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Un adjunto por cada boleta a la que tiene derecho el participante.

    Si hay plantilla PDF cargada, cada adjunto es la invitación completa
    (nombre + QR ya combinados sobre la plantilla). Si no hay plantilla,
    se usa el QR simple como respaldo para no romper el envío de correo.
    """
    tickets = build_qr_tickets(event_id, participant)
    if not is_template_available():
        return tickets

    layout = layout or load_layout()
    attachments = []
    for ticket in tickets:
        try:
            composed_image = compose_invitation_data_uri(
                participant_name=participant.get("name", ""),
                qr_image_data_uri=ticket["image"],
                layout=layout,
            )
            attachments.append({**ticket, "image": composed_image})
        except Exception:
            attachments.append(ticket)
    return attachments


@app.get("/events/{event_id}/qr/bulk")
def generate_bulk_qr(event_id: str, current_user: dict = Depends(require_role("ADMIN"))) -> Dict[str, Any]:
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(event_id)
    generated = []
    for participant in participants:
        generated.append({"participant": participant, "tickets": build_qr_tickets(event_id, participant)})

    return {"event": event, "participants": generated}


@app.get("/events/{event_id}/qr/{participant_id}")
def generate_qr(
    event_id: str,
    participant_id: str,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    participant = store.get_participant(participant_id)
    if not participant or participant.get("event_id") != event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    return {"participant": participant, "tickets": build_qr_tickets(event_id, participant)}


@app.get("/events/{event_id}/invitation/{participant_id}")
def generate_composed_invitation(
    event_id: str,
    participant_id: str,
    current_user: dict = Depends(require_role("ADMIN", "LOGISTICO")),
) -> Dict[str, Any]:
    """Devuelve la invitación armada: plantilla + nombre + QR, un PNG por boleta."""

    participant = store.get_participant(participant_id)
    if not participant or participant.get("event_id") != event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    if not is_template_available():
        raise HTTPException(status_code=404, detail="No hay plantilla PDF cargada. Súbela en el panel administrador.")

    layout = load_layout()
    tickets = build_qr_tickets(event_id, participant)
    invitations = [
        {
            "index": ticket["index"],
            "image": compose_invitation_data_uri(
                participant_name=participant.get("name", ""),
                qr_image_data_uri=ticket["image"],
                layout=layout,
            ),
        }
        for ticket in tickets
    ]
    return {"participant": participant, "invitations": invitations}


@app.get("/events/{event_id}/invitations/document")
def generate_invitations_document(
    event_id: str,
    current_user: dict = Depends(require_role("ADMIN")),
) -> StreamingResponse:
    """PDF con una página por invitación (nombre + QR) de todo el evento, para verificar de un vistazo."""

    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not is_template_available():
        raise HTTPException(status_code=404, detail="No hay plantilla PDF cargada. Súbela en el panel administrador.")

    participants = store.list_participants(event_id)
    if not participants:
        raise HTTPException(status_code=404, detail="El evento no tiene participantes todavía.")

    layout = load_layout()
    items = []
    skipped = []
    for participant in participants:
        try:
            tickets = build_qr_tickets(event_id, participant)
        except Exception as exc:
            # Un registro con datos corruptos (ej. importado por error desde un
            # archivo binario) no debe tumbar el documento completo de todos.
            skipped.append(participant.get("name") or participant.get("id"))
            continue
        for ticket in tickets:
            items.append(
                {
                    "participant_name": participant.get("name", ""),
                    "qr_image_bytes": base64.b64decode(ticket["image"].split(",", 1)[1]),
                }
            )

    if not items:
        raise HTTPException(
            status_code=404,
            detail="No se pudo generar ninguna invitación (revisa que los participantes tengan datos válidos).",
        )

    try:
        pdf_bytes = build_invitations_document(items, layout=layout)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if skipped:
        # No hay forma de "avisar" dentro de un PDF binario sin abrir el archivo;
        # se deja constancia en logs del servidor para que el admin lo revise.
        print(f"[invitations/document] Se omitieron {len(skipped)} participantes con datos inválidos: {skipped}")

    filename = f"invitaciones_{event_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.post("/attendance/scan")
async def scan_attendance(
    body: AttendanceScan,
    current_user: dict = Depends(require_role("ADMIN", "SCANNER")),
) -> Dict[str, Any]:
    payload = json.loads(body.payload)
    participant = store.get_participant(payload["participant_id"])
    if not participant or participant.get("event_id") != body.event_id:
        raise HTTPException(status_code=404, detail="Invalid QR for the current event")
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="QR token is missing")
    existing = store.find_attendance_by_token(body.event_id, token)
    if existing:
        result = {"status": "duplicate", "message": "This QR has already been used", "participant": participant}
    else:
        attendance = store.create_attendance(
            {
                "event_id": body.event_id,
                "participant_id": payload["participant_id"],
                "cedula": participant.get("cedula"),
                "token": token,
                "ticket_index": payload.get("ticket_index"),
                "timestamp": datetime.utcnow().isoformat(),
                "mode": body.source,
                "status": "valid",
            }
        )
        result = {"status": "valid", "attendance": attendance, "participant": participant}
    await broadcast({"type": "attendance", "payload": result})
    return result


@app.get("/attendances/{event_id}")
def list_attendances(event_id: str, current_user: dict = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return store.list_attendances(event_id)


@app.get("/events/{event_id}/summary")
def event_summary(event_id: str, current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """Actividad agregada del evento: usada para la barra de progreso en admin/logistico."""

    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(event_id)
    attendances = store.list_attendances(event_id)
    capacity = int(event.get("capacity") or 0)
    total_invitations = sum(max(1, p.get("ticket_count", 1)) for p in participants)
    used_invitations = len(attendances)

    return {
        "event_id": event_id,
        "participants_count": len(participants),
        "capacity": capacity,
        "total_invitations": total_invitations,
        "used_invitations": used_invitations,
        "pending_invitations": max(0, total_invitations - used_invitations),
        "checked_in": used_invitations,
        "capacity_used_pct": round((used_invitations / capacity) * 100) if capacity else 0,
    }


@app.get("/events/{event_id}/report")
def event_report(event_id: str, current_user: dict = Depends(require_role("ADMIN"))):
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    participants = store.list_participants(event_id)
    attendances = store.list_attendances(event_id)
    attendance_map = {}
    for att in attendances:
        pid = att.get("participant_id")
        if pid not in attendance_map:
            attendance_map[pid] = []
        attendance_map[pid].append(att)

    rows = []
    for participant in participants:
        used = attendance_map.get(participant["id"], [])
        pending_count = max(0, participant.get("ticket_count", 1) - len(used))
        latest = max(used, key=lambda att: att.get("timestamp", ""), default=None) if used else None
        rows.append(
            {
                "Evento": event["name"],
                "Participante": participant["name"],
                "Cédula": participant["cedula"],
                "Email": participant["email"],
                "Teléfono": participant["phone"],
                "Programa": participant.get("programa", ""),
                "Sede": participant.get("sede", ""),
                "Cohorte": participant.get("cohorte", ""),
                "Promedio": participant.get("promedio", ""),
                "Invitaciones emitidas": participant.get("ticket_count", 1),
                "Invitaciones usadas": len(used),
                "Invitaciones pendientes": pending_count,
                "Estado asistencia": "Asistió" if used else "Pendiente",
                "Ticket index": latest.get("ticket_index") if latest else None,
                "Token": latest.get("token") if latest else None,
                "Fecha/Hora ingreso": latest.get("timestamp") if latest else None,
                "Modo": latest.get("mode") if latest else None,
            }
        )

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Asistencia")
    buffer.seek(0)
    filename = f"reporte_asistencia_{event_id}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.websocket("/ws/attendances")
async def websocket_attendances(websocket: WebSocket) -> None:
    # Sin auth a propósito: el frontend actual no se conecta a este canal.
    # Si se conecta en el futuro, pasar el JWT como query param (?token=...)
    # y validarlo con decode_access_token antes de accept().
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(websocket)


async def broadcast(message: Dict[str, Any]) -> None:
    for client in list(connected_clients):
        try:
            await client.send_json(message)
        except Exception:
            connected_clients.discard(client)
