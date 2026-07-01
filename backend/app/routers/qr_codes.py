import base64
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..database import get_db
from ..services.email_service import send_email_qr
from ..services.qr_service import generate_qr_image_base64
from ..services.whatsapp_service import send_whatsapp_qr
from ..utils.auth import get_current_user
from ..utils.helpers import parse_object_id, serialize_doc

router = APIRouter()


class SendWhatsAppRequest(BaseModel):
    evento_id: str
    from_number: Optional[str] = None


class SendEmailRequest(BaseModel):
    evento_id: str
    from_email: Optional[str] = None
    smtp_config: Optional[dict] = None


def ensure_roles(current_user: dict, allowed_roles: list[str]):
    if current_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


async def build_qr_document(participant: dict, event: dict, boleta_num: int) -> dict:
    qr_id = str(uuid.uuid4())
    total_boletas = participant.get("num_invitados", event.get("invitaciones_por_participante", 2))
    qr_data = {
        "qr_id": qr_id,
        "evento_id": participant["evento_id"],
        "cedula": participant["no_documento"],
        "numero_boleta": boleta_num,
        "total_boletas": total_boletas,
    }
    img_b64 = generate_qr_image_base64(qr_data)
    return {
        "qr_id": qr_id,
        "evento_id": participant["evento_id"],
        "participante_id": str(participant["_id"]),
        "cedula": participant["no_documento"],
        "numero_boleta": boleta_num,
        "total_boletas": total_boletas,
        "usado": False,
        "fecha_uso": None,
        "hora_uso": None,
        "dispositivo_uso": None,
        "imagen_qr_base64": img_b64,
        "enviado_whatsapp": False,
        "enviado_email": False,
        "created_at": datetime.utcnow(),
    }


@router.post("/generate/{evento_id}")
async def generate_qr_mass(evento_id: str, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin"])

    db = get_db()
    event = await db.events.find_one({"_id": parse_object_id(evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = await db.participants.find({"evento_id": evento_id}).to_list(None)

    qr_count = 0
    for participant in participants:
        num_boletas = participant.get("num_invitados", event.get("invitaciones_por_participante", 2))
        for boleta_num in range(1, num_boletas + 1):
            existing = await db.qr_codes.find_one(
                {"participante_id": str(participant["_id"]), "numero_boleta": boleta_num}
            )
            if existing:
                continue

            qr_doc = await build_qr_document(participant, event, boleta_num)
            await db.qr_codes.insert_one(qr_doc)
            qr_count += 1

    return {"message": f"{qr_count} QR codes generated", "count": qr_count}


@router.post("/generate-individual/{participante_id}")
async def generate_qr_individual(participante_id: str, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin", "logistico"])

    db = get_db()
    participant = await db.participants.find_one({"_id": parse_object_id(participante_id, "Participant")})
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    event = await db.events.find_one({"_id": parse_object_id(participant["evento_id"], "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    num_boletas = participant.get("num_invitados", event.get("invitaciones_por_participante", 2))

    generated = []
    for boleta_num in range(1, num_boletas + 1):
        existing = await db.qr_codes.find_one(
            {"participante_id": participante_id, "numero_boleta": boleta_num}
        )
        if existing:
            generated.append(serialize_doc(existing))
            continue

        qr_doc = await build_qr_document(participant, event, boleta_num)
        await db.qr_codes.insert_one(qr_doc)
        generated.append(serialize_doc(qr_doc))

    return generated


@router.get("/list/{evento_id}")
async def list_qr(evento_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    qr_codes = await db.qr_codes.find({"evento_id": evento_id}).sort([("cedula", 1), ("numero_boleta", 1)]).to_list(None)

    result = []
    for qr in qr_codes:
        qr_data = serialize_doc(qr)
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if participant:
            qr_data["participante_nombre"] = participant.get("apellidos_nombres", "")
        result.append(qr_data)

    return result


@router.get("/image/{qr_id_param}")
async def get_qr_image(qr_id_param: str):
    db = get_db()
    qr = await db.qr_codes.find_one({"qr_id": qr_id_param})
    if not qr or not qr.get("imagen_qr_base64"):
        raise HTTPException(status_code=404, detail="QR image not found")
    return Response(content=base64.b64decode(qr["imagen_qr_base64"]), media_type="image/png")


@router.post("/send-whatsapp")
async def send_whatsapp_mass(request: SendWhatsAppRequest, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin"])

    db = get_db()
    event = await db.events.find_one({"_id": parse_object_id(request.evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    qr_codes = await db.qr_codes.find({"evento_id": request.evento_id, "enviado_whatsapp": False}).to_list(None)

    sent_count = 0
    for qr in qr_codes:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue

        try:
            success = await send_whatsapp_qr(
                to_number=participant.get("tel1", ""),
                from_number=request.from_number,
                nombre=participant.get("apellidos_nombres", ""),
                numero_boleta=qr["numero_boleta"],
                total_boletas=qr["total_boletas"],
                fecha=str(event.get("fecha", "")),
                lugar=event.get("lugar", ""),
                qr_image_b64=qr.get("imagen_qr_base64", ""),
                qr_id=qr["qr_id"],
            )
            if success:
                await db.qr_codes.update_one(
                    {"qr_id": qr["qr_id"]},
                    {"$set": {"enviado_whatsapp": True}},
                )
                sent_count += 1
        except Exception:
            continue

    return {"message": f"{sent_count} WhatsApp messages sent", "count": sent_count}


@router.post("/send-email")
async def send_email_mass(request: SendEmailRequest, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin"])

    db = get_db()
    event = await db.events.find_one({"_id": parse_object_id(request.evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    qr_codes = await db.qr_codes.find({"evento_id": request.evento_id, "enviado_email": False}).to_list(None)

    sent_count = 0
    for qr in qr_codes:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue

        try:
            success = await send_email_qr(
                to_email=participant.get("email_institucional", ""),
                from_email=request.from_email,
                smtp_config=request.smtp_config,
                nombre=participant.get("apellidos_nombres", ""),
                numero_boleta=qr["numero_boleta"],
                total_boletas=qr["total_boletas"],
                fecha=str(event.get("fecha", "")),
                lugar=event.get("lugar", ""),
                qr_image_b64=qr.get("imagen_qr_base64", ""),
                qr_id=qr["qr_id"],
            )
            if success:
                await db.qr_codes.update_one(
                    {"qr_id": qr["qr_id"]},
                    {"$set": {"enviado_email": True}},
                )
                sent_count += 1
        except Exception:
            continue

    return {"message": f"{sent_count} emails sent", "count": sent_count}


@router.post("/send-individual-whatsapp/{qr_id_param}")
async def send_individual_whatsapp(qr_id_param: str, current_user=Depends(get_current_user)):
    ensure_roles(current_user, ["admin", "logistico"])

    db = get_db()
    qr = await db.qr_codes.find_one({"qr_id": qr_id_param})
    if not qr:
        raise HTTPException(status_code=404, detail="QR not found")

    participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    event = await db.events.find_one({"_id": parse_object_id(qr["evento_id"], "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    success = await send_whatsapp_qr(
        to_number=participant.get("tel1", ""),
        from_number=None,
        nombre=participant.get("apellidos_nombres", ""),
        numero_boleta=qr["numero_boleta"],
        total_boletas=qr["total_boletas"],
        fecha=str(event.get("fecha", "")),
        lugar=event.get("lugar", ""),
        qr_image_b64=qr.get("imagen_qr_base64", ""),
        qr_id=qr["qr_id"],
    )

    if success:
        await db.qr_codes.update_one({"qr_id": qr_id_param}, {"$set": {"enviado_whatsapp": True}})

    return {"success": success}


@router.get("/offline-list/{evento_id}")
async def get_offline_list(evento_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    qr_codes = await db.qr_codes.find({"evento_id": evento_id}).sort([("cedula", 1), ("numero_boleta", 1)]).to_list(None)

    result = []
    for qr in qr_codes:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        item = {
            "qr_id": qr["qr_id"],
            "cedula": qr["cedula"],
            "nombre": participant.get("apellidos_nombres", "") if participant else "",
            "apellidos_nombres": participant.get("apellidos_nombres", "") if participant else "",
            "programa": participant.get("programa", "") if participant else "",
            "sede": participant.get("sede", "") if participant else "",
            "evento_id": evento_id,
            "numero_boleta": qr["numero_boleta"],
            "total_boletas": qr["total_boletas"],
            "usado": qr["usado"],
            "fecha_uso": qr.get("fecha_uso"),
        }
        result.append(item)

    return result
