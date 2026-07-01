import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..database import get_db
from ..services.excel_service import generate_attendance_excel, generate_final_report_excel, generate_pending_excel
from ..utils.auth import get_current_user
from ..utils.helpers import parse_object_id, serialize_doc

router = APIRouter()


@router.get("/summary/{evento_id}")
async def get_summary(evento_id: str, current_user=Depends(get_current_user)):
    db = get_db()

    event = await db.events.find_one({"_id": parse_object_id(evento_id, "Event")})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    total_participants = await db.participants.count_documents({"evento_id": evento_id})
    total_qr = await db.qr_codes.count_documents({"evento_id": evento_id})
    used_qr = await db.qr_codes.count_documents({"evento_id": evento_id, "usado": True})
    pending_qr = total_qr - used_qr

    porcentaje = round((used_qr / total_qr * 100), 2) if total_qr > 0 else 0

    return {
        "evento": serialize_doc(event),
        "total_participants": total_participants,
        "total_qr": total_qr,
        "used_qr": used_qr,
        "pending_qr": pending_qr,
        "porcentaje_asistencia": porcentaje,
    }


@router.get("/attendance/{evento_id}")
async def download_attendance_report(evento_id: str, current_user=Depends(get_current_user)):
    if current_user["role"] not in ["admin", "logistico"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = get_db()
    excel_data = await generate_attendance_excel(db, evento_id)

    return StreamingResponse(
        io.BytesIO(excel_data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=asistencia_{evento_id}.xlsx"},
    )


@router.get("/pending/{evento_id}")
async def download_pending_report(evento_id: str, current_user=Depends(get_current_user)):
    if current_user["role"] not in ["admin", "logistico"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = get_db()
    excel_data = await generate_pending_excel(db, evento_id)

    return StreamingResponse(
        io.BytesIO(excel_data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=pendientes_{evento_id}.xlsx"},
    )


@router.get("/final/{evento_id}")
async def download_final_report(evento_id: str, current_user=Depends(get_current_user)):
    if current_user["role"] not in ["admin", "logistico"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = get_db()
    excel_data = await generate_final_report_excel(db, evento_id)

    return StreamingResponse(
        io.BytesIO(excel_data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=informe_final_{evento_id}.xlsx"},
    )
