from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AttendanceModel(BaseModel):
    qr_id: str
    evento_id: str
    participante_id: str
    cedula: str
    nombre: str
    timestamp_escaneo: datetime = Field(default_factory=datetime.utcnow)
    modo_escaneo: Literal["online", "offline"] = "online"
    dispositivo_id: Optional[str] = None
    sincronizado: bool = True


class ValidateQRRequest(BaseModel):
    qr_id: str
    evento_id: str
    dispositivo_id: Optional[str] = None


class SyncRecord(BaseModel):
    qr_id: str
    evento_id: str
    timestamp: str
    dispositivo_id: Optional[str] = None
