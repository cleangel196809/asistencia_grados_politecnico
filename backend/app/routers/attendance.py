from typing import List

from fastapi import APIRouter, Depends

from ..models.attendance import SyncRecord, ValidateQRRequest
from ..services.sync_service import process_sync_records
from ..utils.auth import get_current_user
from ..utils.helpers import parse_object_id, serialize_list
from ..database import get_db

router = APIRouter()


@router.post("/validate")
async def validate_qr(request: ValidateQRRequest, current_user=Depends(get_current_user)):
    db = get_db()

    qr = await db.qr_codes.find_one({"qr_id": request.qr_id})
    if not qr:
        return {"valid": False, "message": "QR NO VÁLIDO", "status": "invalid"}

    if qr["evento_id"] != request.evento_id:
        return {"valid": False, "message": "QR NO VÁLIDO para este evento", "status": "invalid"}

    participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
    nombre = participant.get("apellidos_nombres", "") if participant else ""
    programa = participant.get("programa", "") if participant else ""
    sede = participant.get("sede", "") if participant else ""

    if qr["usado"]:
        return {
            "valid": False,
            "message": f"QR YA UTILIZADO - {nombre}",
            "status": "already_used",
            "nombre": nombre,
            "hora_uso": qr.get("hora_uso"),
            "fecha_uso": qr.get("fecha_uso"),
        }

    from datetime import datetime

    now = datetime.utcnow()
    fecha_uso = now.strftime("%Y-%m-%d")
    hora_uso = now.strftime("%H:%M:%S")

    await db.qr_codes.update_one(
        {"qr_id": request.qr_id},
        {
            "$set": {
                "usado": True,
                "fecha_uso": fecha_uso,
                "hora_uso": hora_uso,
                "dispositivo_uso": request.dispositivo_id,
            }
        },
    )

    attendance_doc = {
        "qr_id": request.qr_id,
        "evento_id": request.evento_id,
        "participante_id": qr["participante_id"],
        "cedula": qr["cedula"],
        "nombre": nombre,
        "timestamp_escaneo": now,
        "modo_escaneo": "online",
        "dispositivo_id": request.dispositivo_id,
        "sincronizado": True,
    }
    await db.attendance.insert_one(attendance_doc)

    from ..routers.websocket import broadcast_to_event

    try:
        await broadcast_to_event(
            request.evento_id,
            {
                "type": "scan",
                "nombre": nombre,
                "cedula": qr["cedula"],
                "boleta": f"{qr['numero_boleta']} de {qr['total_boletas']}",
                "timestamp": now.isoformat(),
            },
        )
    except Exception:
        pass

    return {
        "valid": True,
        "message": f"Bienvenido {nombre}",
        "status": "success",
        "nombre": nombre,
        "programa": programa,
        "sede": sede,
        "numero_boleta": qr["numero_boleta"],
        "total_boletas": qr["total_boletas"],
        "cedula": qr["cedula"],
    }


@router.post("/sync")
async def sync_offline(records: List[SyncRecord], current_user=Depends(get_current_user)):
    return await process_sync_records([record.model_dump() for record in records])


@router.get("/{evento_id}")
async def list_attendance(evento_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    attendance = await db.attendance.find({"evento_id": evento_id}).sort("timestamp_escaneo", -1).to_list(None)
    return serialize_list(attendance)
