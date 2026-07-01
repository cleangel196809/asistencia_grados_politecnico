import io

import pandas as pd

from ..utils.helpers import parse_object_id


async def generate_attendance_excel(db, evento_id: str) -> bytes:
    """Generate Excel report for attended participants."""
    qr_codes = await db.qr_codes.find({"evento_id": evento_id, "usado": True}).to_list(None)

    rows = []
    for qr in qr_codes:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue

        rows.append(
            {
                "Nombres y Apellidos": participant.get("apellidos_nombres", ""),
                "Cédula": qr.get("cedula", ""),
                "Boleta #": f"{qr.get('numero_boleta', '')}/{qr.get('total_boletas', '')}",
                "Hora de Uso": qr.get("hora_uso", ""),
                "Fecha de Uso": qr.get("fecha_uso", ""),
                "Sede": participant.get("sede", ""),
                "Programa": participant.get("programa", ""),
                "Cohorte": participant.get("cohorte", ""),
            }
        )

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Asistencia")
    buffer.seek(0)
    return buffer.getvalue()


async def generate_pending_excel(db, evento_id: str) -> bytes:
    """Generate Excel report for pending (not yet used) QR codes."""
    qr_codes = await db.qr_codes.find({"evento_id": evento_id, "usado": False}).to_list(None)

    rows = []
    for qr in qr_codes:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue

        rows.append(
            {
                "Nombres y Apellidos": participant.get("apellidos_nombres", ""),
                "Cédula": qr.get("cedula", ""),
                "Boleta #": f"{qr.get('numero_boleta', '')}/{qr.get('total_boletas', '')}",
                "Teléfono": participant.get("tel1", ""),
                "Email": participant.get("email_institucional", ""),
                "Sede": participant.get("sede", ""),
                "Programa": participant.get("programa", ""),
                "Enviado WhatsApp": "Sí" if qr.get("enviado_whatsapp") else "No",
                "Enviado Email": "Sí" if qr.get("enviado_email") else "No",
            }
        )

    df = pd.DataFrame(rows)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Pendientes")
    buffer.seek(0)
    return buffer.getvalue()


async def generate_final_report_excel(db, evento_id: str) -> bytes:
    attendance_qr = await db.qr_codes.find({"evento_id": evento_id, "usado": True}).to_list(None)
    pending_qr = await db.qr_codes.find({"evento_id": evento_id, "usado": False}).to_list(None)

    attendance_rows = []
    for qr in attendance_qr:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue
        attendance_rows.append(
            {
                "Nombres y Apellidos": participant.get("apellidos_nombres", ""),
                "Cédula": qr.get("cedula", ""),
                "Boleta #": f"{qr.get('numero_boleta', '')}/{qr.get('total_boletas', '')}",
                "Hora de Uso": qr.get("hora_uso", ""),
                "Fecha de Uso": qr.get("fecha_uso", ""),
                "Sede": participant.get("sede", ""),
                "Programa": participant.get("programa", ""),
                "Cohorte": participant.get("cohorte", ""),
            }
        )

    pending_rows = []
    for qr in pending_qr:
        participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})
        if not participant:
            continue
        pending_rows.append(
            {
                "Nombres y Apellidos": participant.get("apellidos_nombres", ""),
                "Cédula": qr.get("cedula", ""),
                "Boleta #": f"{qr.get('numero_boleta', '')}/{qr.get('total_boletas', '')}",
                "Teléfono": participant.get("tel1", ""),
                "Email": participant.get("email_institucional", ""),
                "Sede": participant.get("sede", ""),
                "Programa": participant.get("programa", ""),
                "Enviado WhatsApp": "Sí" if qr.get("enviado_whatsapp") else "No",
                "Enviado Email": "Sí" if qr.get("enviado_email") else "No",
            }
        )

    attendance_df = pd.DataFrame(attendance_rows)
    pending_df = pd.DataFrame(pending_rows)

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        attendance_df.to_excel(writer, index=False, sheet_name="Asistidos")
        pending_df.to_excel(writer, index=False, sheet_name="Pendientes")
    buffer.seek(0)
    return buffer.getvalue()
