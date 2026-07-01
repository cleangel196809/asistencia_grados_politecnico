from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class HorarioItem(BaseModel):
    hora_inicio: str
    hora_fin: str
    descripcion: str


class EventModel(BaseModel):
    nombre: str
    fecha: datetime
    lugar: str
    capacidad_auditorio: int
    modo: Literal["online", "offline"] = "online"
    horario: List[HorarioItem] = Field(default_factory=list)
    invitaciones_por_participante: int = 2
    activo: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EventCreate(BaseModel):
    nombre: str
    fecha: datetime
    lugar: str
    capacidad_auditorio: int
    modo: Literal["online", "offline"] = "online"
    horario: List[HorarioItem] = Field(default_factory=list)
    invitaciones_por_participante: int = 2
    activo: bool = True


class EventUpdate(BaseModel):
    nombre: Optional[str] = None
    fecha: Optional[datetime] = None
    lugar: Optional[str] = None
    capacidad_auditorio: Optional[int] = None
    modo: Optional[Literal["online", "offline"]] = None
    horario: Optional[List[HorarioItem]] = None
    invitaciones_por_participante: Optional[int] = None
    activo: Optional[bool] = None
