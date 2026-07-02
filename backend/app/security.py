import os
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
DEFAULT_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# Si no se define JWT_SECRET_KEY, se genera una clave aleatoria al iniciar el
# proceso. Eso mantiene el arranque sin configuración (como el resto de este
# backend), a costa de invalidar tokens existentes en cada reinicio del
# servidor. Para producción, define JWT_SECRET_KEY en el entorno.
_env_secret = os.getenv("JWT_SECRET_KEY")
if not _env_secret:
    print(
        "[security] JWT_SECRET_KEY no definida: usando una clave generada para "
        "este proceso. Los tokens dejarán de ser válidos si el servidor se reinicia. "
        "Define JWT_SECRET_KEY en producción (ver backend/.env.example)."
    )
_SECRET_KEY = _env_secret or secrets.token_urlsafe(32)


def _secret_key() -> str:
    return _SECRET_KEY


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except (ValueError, TypeError):
        return False


def create_access_token(data: Dict[str, Any], expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or DEFAULT_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, _secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Token inválido o expirado") from exc
