from typing import Optional

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MONGODB_URL: str = Field(
        default="mongodb://localhost:27017",
        validation_alias=AliasChoices("MONGODB_URL", "MONGO_URL"),
    )
    MONGODB_DB: str = Field(
        default="politecnico_grados",
        validation_alias=AliasChoices("MONGODB_DB", "DB_NAME"),
    )
    SECRET_KEY: str = "cambiar_esta_clave_en_produccion_muy_larga_y_segura"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    MAIL_USERNAME: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("MAIL_USERNAME", "SMTP_USER"),
    )
    MAIL_PASSWORD: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("MAIL_PASSWORD", "SMTP_PASSWORD"),
    )
    MAIL_FROM: Optional[str] = "eventospolitecnicointernacional@pi.edu.co"
    MAIL_PORT: int = Field(default=587, validation_alias=AliasChoices("MAIL_PORT", "SMTP_PORT"))
    MAIL_SERVER: str = Field(
        default="smtp.gmail.com",
        validation_alias=AliasChoices("MAIL_SERVER", "SMTP_HOST"),
    )
    MAIL_FROM_NAME: str = "Politécnico Internacional"
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", extra="allow")


settings = Settings()
