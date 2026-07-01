from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class QRCodeModel(BaseModel):
    qr_id: str
    evento_id: str
    participante_id: str
    cedula: str
    numero_boleta: int
    total_boletas: int
    usado: bool = False
    fecha_uso: Optional[str] = None
    hora_uso: Optional[str] = None
    dispositivo_uso: Optional[str] = None
    imagen_qr_base64: Optional[str] = None
    enviado_whatsapp: bool = False
    enviado_email: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
