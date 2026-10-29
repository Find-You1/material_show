"""注册与登录。"""

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.user import ROLE_USER, User
from app.schemas.user import RegisterIn


def find_by_account(db: Session, account: str) -> User | None:
    return db.scalar(
        select(User).where(or_(User.username == account, User.email == account))
    )


def register(db: Session, data: RegisterIn) -> User:
    exists = db.scalar(
        select(User.id).where(
            or_(
                User.username == data.username,
                func.lower(User.email) == data.email.lower(),
            )
        )
    )
    if exists:
        raise ConflictError("用户名或邮箱已被占用")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        nickname=data.nickname or data.username,
        role=ROLE_USER,
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # 并发注册时靠数据库唯一约束兜底
        db.rollback()
        raise ConflictError("用户名或邮箱已被占用")
    return user


def authenticate(db: Session, account: str, password: str) -> User:
    user = find_by_account(db, account)
    # 用户不存在与密码错误返回同一个提示，避免账号枚举
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("CREDENTIALS_INVALID", "账号或密码不正确")
    if not user.is_active:
        raise UnauthorizedError("USER_DISABLED", "账号已被停用，请联系管理员")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return user


def change_password(db: Session, user: User, old_password: str, new_password: str) -> None:
    if not verify_password(old_password, user.password_hash):
        raise UnauthorizedError("OLD_PASSWORD_INVALID", "原密码不正确")
    user.password_hash = hash_password(new_password)
    db.commit()