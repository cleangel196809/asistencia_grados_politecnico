from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    username: str
    password_hash: str
    full_name: str
    role: Literal["admin", "logistico", "scanner"]
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(populate_by_name=True)


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: Literal["admin", "logistico", "scanner"]
    active: bool = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[Literal["admin", "logistico", "scanner"]] = None
    active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    active: bool
    created_at: datetime
