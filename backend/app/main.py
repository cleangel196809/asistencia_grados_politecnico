import base64
import io
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import qrcode
from pypdf import PdfReader
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.database import store
from app.email_service import is_smtp_configured, send_bulk_invitation_emails, send_invitation_email
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


@app.post("/invitations/whatsapp/trello/program")
def program_whatsapp_trello(
    event_id: str,
    whatsapp_text: str = "",
    participant_ids: Optional[List[str]] = None,
):
    """Programa envío WhatsApp masivo creando una Card por invitado en Trello."""

    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(event_id)
    if participant_ids:
        participant_ids_set = set(participant_ids)
        participants = [p for p in participants if p.get("id") in participant_ids_set]

    # QR payloads por participante (usa ticket_count de cada invitado)
    qr_payloads_by_participant: Dict[str, List[str]] = {}
    for p in participants:
        tickets = build_qr_tickets(event_id, p)
        qr_payloads_by_participant[str(p.get("id"))] = [t.get("payload") for t in tickets if t.get("payload")]

    whatsapp_text_by_participant: Dict[str, str] = {}
    for p in participants:
        whatsapp_text_by_participant[str(p.get("id"))] = whatsapp_text

    result = program_whatsapp_cards_for_event(
        event=event,
        participants=participants,
        whatsapp_text_by_participant=whatsapp_text_by_participant,
        qr_payloads_by_participant=qr_payloads_by_participant,
    )
    return result


@app.get("/invitations/email/status")
def email_status() -> Dict[str, Any]:
    return {"configured": is_smtp_configured()}


@app.post("/invitations/email/program")
def program_email_bulk(body: EmailProgramRequest) -> Dict[str, Any]:
    """Envía correo real (SMTP) con QR adjunto a todos los invitados del evento (o a un subconjunto)."""

    event = store.get_event(body.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(body.event_id)
    if body.participant_ids:
        participant_ids_set = set(body.participant_ids)
        participants = [p for p in participants if p.get("id") in participant_ids_set]

    subject = body.subject or f"Invitación a {event.get('name', 'evento')}"
    recipients = []
    for p in participants:
        if not p.get("email"):
            continue
        tickets = build_qr_tickets(body.event_id, p)
        body_text = (
            f"{body.body_text}\n\n"
            f"Hola {p.get('name', '')}, te invitamos al evento {event.get('name', '')} "
            f"en {event.get('location', '')} el {event.get('date', '')}.\n\n"
            "Adjuntamos tu(s) código(s) QR de ingreso."
        ).strip()
        recipients.append(
            {
                "participant_id": p.get("id"),
                "to_address": p.get("email"),
                "subject": subject,
                "body_text": body_text,
                "qr_images": tickets,
            }
        )

    result = send_bulk_invitation_emails(recipients=recipients)
    return result


@app.post("/invitations/email/individual")
def send_email_individual(body: EmailIndividualRequest) -> Dict[str, Any]:
    """Envía correo real (SMTP) con QR adjunto a un único invitado."""

    event = store.get_event(body.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant = store.get_participant(body.participant_id)
    if not participant or participant.get("event_id") != body.event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    tickets = build_qr_tickets(body.event_id, participant)
    subject = body.subject or f"Invitación a {event.get('name', 'evento')}"
    body_text = (
        f"{body.body_text}\n\n"
        f"Hola {participant.get('name', '')}, te invitamos al evento {event.get('name', '')} "
        f"en {event.get('location', '')} el {event.get('date', '')}.\n\n"
        "Adjuntamos tu(s) código(s) QR de ingreso."
    ).strip()

    result = send_invitation_email(
        to_address=participant.get("email", ""),
        subject=subject,
        body_text=body_text,
        qr_images=tickets,
    )
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
def list_events() -> List[Dict[str, Any]]:
    return store.list_events()


@app.post("/events", response_model=Dict[str, Any])
def create_event(body: EventCreate) -> Dict[str, Any]:
    event = store.create_event(body.model_dump())
    return event


@app.put("/events/{event_id}")
def update_event(event_id: str, body: EventCreate) -> Dict[str, Any]:
    updated = store.update_event(event_id, body.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Event not found")
    return updated


@app.delete("/events/{event_id}")
def delete_event(event_id: str) -> Dict[str, Any]:
    deleted = store.delete_event(event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"deleted": True}


@app.get("/events/{event_id}/participants")
def list_participants(event_id: str) -> List[Dict[str, Any]]:
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
def create_participant(body: ParticipantCreate) -> Dict[str, Any]:
    participant = store.create_participant(body.model_dump())
    return participant


@app.get("/participants/search")
def search_participants(cedula: str, event_id: Optional[str] = None) -> List[Dict[str, Any]]:
    return store.search_participants(cedula, event_id)


@app.put("/participants/{participant_id}")
def update_participant(participant_id: str, body: ParticipantCreate) -> Dict[str, Any]:
    updated = store.update_participant(participant_id, body.model_dump())
    if not updated:
        raise HTTPException(status_code=404, detail="Participant not found")
    return updated


@app.delete("/participants/{participant_id}")
def delete_participant(participant_id: str) -> Dict[str, Any]:
    deleted = store.delete_participant(participant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {"deleted": True}


@app.post("/participants/import")
async def import_participants(event_id: str, file: UploadFile = File(...)) -> Dict[str, Any]:
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


def parse_pdf_invitation_lines(raw_text: str) -> List[str]:
    delimiter_pattern = re.compile(r"[;,|\t]")
    email_pattern = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    document_pattern = re.compile(r"\b\d{5,}\b")
    phone_pattern = re.compile(r"\b\d{7,15}\b")
    ignored_words = {
        "nombre",
        "nombres",
        "documento",
        "cedula",
        "email",
        "correo",
        "telefono",
        "tel",
        "programa",
        "sede",
        "cohorte",
        "promedio",
        "cantidad",
        "qr",
    }

    normalized_rows: List[str] = []
    for line in raw_text.splitlines():
        compact = " ".join(line.strip().split())
        if len(compact) < 6:
            continue
        lowercase = compact.lower()
        if any(keyword in lowercase for keyword in ignored_words) and not document_pattern.search(compact):
            continue

        if delimiter_pattern.search(compact):
            parts = re.split(r"[;,|\t]", compact)
            cleaned = [part.strip() for part in parts]
            if len(cleaned) >= 2 and cleaned[0] and document_pattern.search(cleaned[1]):
                row = cleaned[:9]
                while len(row) < 9:
                    row.append("1" if len(row) == 8 else "")
                if not row[8]:
                    row[8] = "1"
                normalized_rows.append(";".join(row))
            continue

        document_match = document_pattern.search(compact)
        if not document_match:
            continue

        document_value = document_match.group(0)
        name_value = compact[: document_match.start()].strip(" -:|,")
        if not name_value:
            continue

        email_match = email_pattern.search(compact)
        email_value = email_match.group(0) if email_match else ""

        tail = compact[document_match.end() :]
        phone_match = phone_pattern.search(tail)
        phone_value = phone_match.group(0) if phone_match else ""

        row = [name_value, document_value, email_value, phone_value, "", "", "", "", "1"]
        normalized_rows.append(";".join(row))

    unique_rows = list(dict.fromkeys(normalized_rows))
    return unique_rows


@app.post("/invitations/template")
async def upload_invitation_template(file: UploadFile = File(...)) -> Dict[str, Any]:
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
def get_invitation_template_status() -> Dict[str, Any]:
    exists = TEMPLATE_FILE.exists()
    return {
        "exists": exists,
        "size_bytes": TEMPLATE_FILE.stat().st_size if exists else 0,
        "download_url": "/invitations/template/download" if exists else None,
    }


@app.get("/invitations/template/download")
def download_invitation_template() -> FileResponse:
    if not TEMPLATE_FILE.exists():
        raise HTTPException(status_code=404, detail="Invitation template not found")
    return FileResponse(
        TEMPLATE_FILE,
        media_type="application/pdf",
        filename="plantilla_invitaciones.pdf",
    )


@app.post("/participants/import-pdf-preview")
async def import_participants_pdf_preview(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="PDF file is empty")

    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}")

    extracted_chunks: List[str] = []
    for page in reader.pages:
        extracted_chunks.append(page.extract_text() or "")

    text = "\n".join(extracted_chunks).strip()
    if not text:
        raise HTTPException(status_code=400, detail="No readable text was found in the PDF")

    rows = parse_pdf_invitation_lines(text)
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No invitation rows were detected. Verify that the PDF has selectable text and columns with Nombre y Documento.",
        )

    return {"rows": rows, "detected": len(rows)}


@app.post("/login")
def login_user(body: UserLogin) -> Dict[str, Any]:
    user = store.validate_user(body.username, body.password, body.role)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"username": user["username"], "role": user["role"]}


@app.get("/users")
def list_users() -> List[Dict[str, Any]]:
    return store.list_users()


@app.delete("/users/{user_id}")
def delete_user(user_id: str) -> Dict[str, Any]:
    deleted = store.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


@app.post("/users")
def create_user(body: UserCreate) -> Dict[str, Any]:
    try:
        user = store.create_user(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


@app.put("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate) -> Dict[str, Any]:
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


@app.get("/events/{event_id}/qr/bulk")
def generate_bulk_qr(event_id: str) -> Dict[str, Any]:
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = store.list_participants(event_id)
    generated = []
    for participant in participants:
        generated.append({"participant": participant, "tickets": build_qr_tickets(event_id, participant)})

    return {"event": event, "participants": generated}


@app.get("/events/{event_id}/qr/{participant_id}")
def generate_qr(event_id: str, participant_id: str) -> Dict[str, Any]:
    participant = store.get_participant(participant_id)
    if not participant or participant.get("event_id") != event_id:
        raise HTTPException(status_code=404, detail="Participant not found for the selected event")

    return {"participant": participant, "tickets": build_qr_tickets(event_id, participant)}


@app.post("/attendance/scan")
async def scan_attendance(body: AttendanceScan) -> Dict[str, Any]:
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
def list_attendances(event_id: str) -> List[Dict[str, Any]]:
    return store.list_attendances(event_id)


@app.get("/events/{event_id}/report")
def event_report(event_id: str):
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
