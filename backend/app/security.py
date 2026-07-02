import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
DEFAULT_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

_SECRET_FILE = Path(__file__).resolve().parents[1] / ".data" / "jwt_secret.key"


def _load_or_create_secret() -> str:
    env_secret = os.getenv("JWT_SECRET_KEY")
    if env_secret:
        return env_secret

    try:
        if _SECRET_FILE.exists():
            saved = _SECRET_FILE.read_text(encoding="utf-8").strip()
            if saved:
                return saved
        _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        generated = secrets.token_urlsafe(32)
        _SECRET_FILE.write_text(generated, encoding="utf-8")
        print(
            "[security] JWT_SECRET_KEY no definida: se generó y guardó una clave en "
            f"{_SECRET_FILE}. Las sesiones sobrevivirán a reinicios del backend. "
            "Define JWT_SECRET_KEY en el entorno para producción."
        )
        return generated
    except OSError:
        # Sin acceso de escritura al disco: la clave solo vive en memoria y las
        # sesiones se invalidan en cada reinicio (no debería pasar en local/dev normal).
        print(
            "[security] No se pudo guardar JWT_SECRET_KEY en disco: usando una clave "
            "solo en memoria para este proceso."
        )
        return secrets.token_urlsafe(32)


_SECRET_KEY = _load_or_create_secret()


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
