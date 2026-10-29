"""密码哈希与 JWT。

注意：
- 项目直接用 bcrypt，不用 passlib（passlib 1.7.4 读取 bcrypt.__about__，
  在 bcrypt >= 4.1 会告警，5.x 直接崩溃）。
- bcrypt 5.0 对超过 72 字节的密码抛 ValueError（不再静默截断），
  所以这里显式截断，schema 层也会限制 max_length。
- PyJWT 2.10+ 要求 sub 必须是字符串。
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import UnauthorizedError

ALGORITHM = "HS256"
_BCRYPT_MAX_BYTES = 72


def _to_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "typ": "access",
        "iat": now,
        "exp": now + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("TOKEN_EXPIRED", "登录已过期，请重新登录")
    except jwt.PyJWTError:
        raise UnauthorizedError("TOKEN_INVALID", "登录凭证无效，请重新登录")
    if payload.get("typ") != "access":
        raise UnauthorizedError("TOKEN_INVALID", "登录凭证无效，请重新登录")
    return payload