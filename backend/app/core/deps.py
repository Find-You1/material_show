"""FastAPI 依赖：会话、当前用户、管理员。

JWT 校验后每次都查一次库，这样封禁（is_active=0）能立刻生效 ——
7 天长效 token 没有吊销机制，这一步是必要的补偿。
"""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import ROLE_ADMIN, User

# auto_error=False：未带凭证时返回 None，交给 get_optional_user 处理
bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_user(db: Session, credentials: HTTPAuthorizationCredentials | None) -> User | None:
    if credentials is None or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise UnauthorizedError("TOKEN_INVALID", "登录凭证无效，请重新登录")

    user = db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("USER_NOT_FOUND", "账号不存在")
    if not user.is_active:
        raise UnauthorizedError("USER_DISABLED", "账号已被停用，请联系管理员")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    user = _resolve_user(db, credentials)
    if user is None:
        raise UnauthorizedError()
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """详情页等场景：游客可访问，登录用户能额外看到收藏状态。"""
    return _resolve_user(db, credentials)


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise ForbiddenError("需要管理员权限")
    return user