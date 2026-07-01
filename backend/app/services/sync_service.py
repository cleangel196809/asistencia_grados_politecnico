from datetime import datetime

from ..database import get_db
from ..utils.helpers import parse_object_id


async def process_sync_records(records: list) -> dict:
    """Process offline sync records."""
    db = get_db()
    synced = 0
    duplicates = 0
    invalid = 0

    for record in records:
        qr = await db.qr_codes.find_one({"qr_id": record.get("qr_id")})
        if not qr:
            invalid += 1
            continue

        existing = await db.attendance.find_one({"qr_id": record.get("qr_id")})
        if existing:
            duplicates += 1
            continue

        try:
            timestamp = datetime.fromisoformat(record.get("timestamp", ""))
        except Exception:
            timestamp = datetime.utcnow()

        if not qr["usado"]:
            await db.qr_codes.update_one(
                {"qr_id": record.get("qr_id")},
                {
                    "$set": {
                        "usado": True,
                        "fecha_uso": timestamp.strftime("%Y-%m-%d"),
                        "hora_uso": timestamp.strftime("%H:%M:%S"),
                        "dispositivo_uso": record.get("dispositivo_id"),
                    }
                },
            )

            participant = await db.participants.find_one({"_id": parse_object_id(qr["participante_id"], "Participant")})

            await db.attendance.insert_one(
                {
                    "qr_id": record.get("qr_id"),
                    "evento_id": record.get("evento_id"),
                    "participante_id": qr["participante_id"],
                    "cedula": qr["cedula"],
                    "nombre": participant.get("apellidos_nombres", "") if participant else "",
                    "timestamp_escaneo": timestamp,
                    "modo_escaneo": "offline",
                    "dispositivo_id": record.get("dispositivo_id"),
                    "sincronizado": True,
                }
            )
            synced += 1
        else:
            duplicates += 1

    return {"synced": synced, "duplicates": duplicates, "invalid": invalid}
