import io
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..database import get_db
from ..models.participant import ParticipantCreate, ParticipantUpdate
from ..utils.auth import get_current_user
from ..utils.helpers import parse_object_id, serialize_doc, serialize_list

router = APIRouter()


def ensure_roles(current_user: dict, allowed_roles: list[str]):
    if current_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/{evento_id}")
async def list_participants(evento_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    participants = await db.participants.find({"evento_id": evento_id}).sort("apellidos_nombres", 1).to_list(None)
    return serialize_list(participants)


@router.post("/upload/{evento_id}")
async def upload_participants(
    evento_id: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    ensure_roles(current_user, ["admin"])
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files are allowed")

    db = get_db()
    event = await db.events.find_one({"_id": parse_object_id(evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Excel file") from exc

    normalized_columns = {str(column).strip().upper(): column for column in df.columns}
    column_mapping = {}

    if "NO DOCUMENTO" in normalized_columns:
        column_mapping[normalized_columns["NO DOCUMENTO"]] = "no_documento"
    elif "DOCUMENTO" in normalized_columns:
        column_mapping[normalized_columns["DOCUMENTO"]] = "no_documento"

    for source, target in {
        "SEDE": "sede",
        "PROGRAMA": "programa",
        "APELLIDOS Y NOMBRES": "apellidos_nombres",
        "TEL1": "tel1",
        "EMAIL INSTITUCIONAL": "email_institucional",
        "COHORTE": "cohorte",
        "PROMEDIO": "promedio",
    }.items():
        if source in normalized_columns:
            column_mapping[normalized_columns[source]] = target

    df = df.rename(columns=column_mapping)

    required_columns = {
        "no_documento",
        "sede",
        "programa",
        "apellidos_nombres",
        "tel1",
        "email_institucional",
        "cohorte",
        "promedio",
    }
    missing_columns = sorted(required_columns - set(df.columns))
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required columns: {', '.join(missing_columns)}. "
                "Use DOCUMENTO or No DOCUMENTO, plus SEDE, PROGRAMA, "
                "APELLIDOS Y NOMBRES, TEL1, EMAIL INSTITUCIONAL, COHORTE y PROMEDIO."
            ),
        )

    participants_to_insert = []
    num_invitados = event.get("invitaciones_por_participante", 2)

    for _, row in df.iterrows():
        no_documento = str(row.get("no_documento", "")).strip()
        if not no_documento:
            continue

        participant = {
            "evento_id": evento_id,
            "no_documento": no_documento,
            "sede": str(row.get("sede", "")).strip(),
            "programa": str(row.get("programa", "")).strip(),
            "apellidos_nombres": str(row.get("apellidos_nombres", "")).strip(),
            "tel1": str(row.get("tel1", "")).strip(),
            "email_institucional": str(row.get("email_institucional", "")).strip(),
            "cohorte": str(row.get("cohorte", "")).strip(),
            "promedio": float(row.get("promedio", 0.0) or 0.0),
            "num_invitados": num_invitados,
            "created_at": datetime.utcnow(),
        }
        participants_to_insert.append(participant)

    if participants_to_insert:
        await db.participants.insert_many(participants_to_insert)

    return {
        "message": f"{len(participants_to_insert)} participants uploaded",
        "count": len(participants_to_insert),
    }


@router.post("/")
async def create_participant(participant: ParticipantCreate, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin", "logistico"])
    db = get_db()
    event = await db.events.find_one({"_id": parse_object_id(participant.evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant_doc = participant.model_dump()
    participant_doc["created_at"] = datetime.utcnow()
    result = await db.participants.insert_one(participant_doc)
    created = await db.participants.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.put("/{participant_id}")
async def update_participant(participant_id: str, participant: ParticipantUpdate, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin", "logistico"])
    db = get_db()
    object_id = parse_object_id(participant_id, "Participant")
    update_data = participant.model_dump(exclude_unset=True)
    result = await db.participants.update_one({"_id": object_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Participant not found")
    updated = await db.participants.find_one({"_id": object_id})
    return serialize_doc(updated)


@router.delete("/{participant_id}")
async def delete_participant(participant_id: str, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin"])
    db = get_db()
    object_id = parse_object_id(participant_id, "Participant")
    result = await db.participants.delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {"message": "Participant deleted"}
