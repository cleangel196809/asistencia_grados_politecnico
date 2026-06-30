from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ParticipantModel(BaseModel):
    evento_id: str
    no_documento: str
    sede: str
    programa: str
    apellidos_nombres: str
    tel1: str
    email_institucional: str
    cohorte: str
    promedio: float
    num_invitados: int = 2
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ParticipantCreate(BaseModel):
    evento_id: str
    no_documento: str
    sede: str
    programa: str
    apellidos_nombres: str
    tel1: str
    email_institucional: str
    cohorte: str
    promedio: float
    num_invitados: int = 2


class ParticipantUpdate(BaseModel):
    no_documento: Optional[str] = None
    sede: Optional[str] = None
    programa: Optional[str] = None
    apellidos_nombres: Optional[str] = None
    tel1: Optional[str] = None
    email_institucional: Optional[str] = None
    cohorte: Optional[str] = None
    promedio: Optional[float] = None
    num_invitados: Optional[int] = None
