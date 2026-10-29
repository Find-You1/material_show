"""后台用户管理。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.image import Image
from app.models.user import User
from app.schemas.common import MessageOut, Page
from app.schemas.user import AdminUserUpdateIn, UserOut
from app.utils.pagination import page_params

router = APIRouter(prefix="/users", tags=["admin:users"])


@router.get("", response_model=Page[UserOut])
def list_users(
    role: str | None = Query(None, pattern="^(user|admin)$"),
    is_active: bool | None = Query(None),
    q: str | None = Query(None, max_length=50),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
) -> Page[UserOut]:
    page, size = page_params(page, size, max_size=100)

    conds = []
    if role:
        conds.append(User.role == role)
    if is_active is not None:
        conds.append(User.is_active.is_(is_active))
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(or_(User.username.like(like), User.nickname.like(like)))

    total = db.scalar(select(func.count()).select_from(User).where(*conds)) or 0
    rows = db.scalars(
        select(User).where(*conds).order_by(User.id.desc()).limit(size).offset((page - 1) * size)
    ).all()
    return Page(items=list(rows), total=total, page=page, size=size)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    return _get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> User:
    user = _get_user(db, user_id)
    data = payload.model_dump(exclude_unset=True)

    # 防呆：避免管理员把自己降级或停用后彻底锁死后台
    if user.id == admin.id and (
        ("role" in data and data["role"] != admin.role)
        or data.get("is_active") is False
    ):
        raise BadRequestError("不能修改自己的角色或停用自己的账号")

    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    return user


@router.delete("/{user_id}", response_model=MessageOut)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> MessageOut:
    """删除用户。名下有图片时直接拒绝，避免作品变成无主数据。"""
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise BadRequestError("不能删除自己的账号")

    owned = db.scalar(
        select(func.count())
        .select_from(Image)
        .where(Image.owner_id == user.id, Image.is_deleted.is_(False))
    )
    if owned:
        raise BadRequestError(f"该用户名下还有 {owned} 张图片，请先处理后再删除")

    db.delete(user)
    db.commit()
    return MessageOut(message="已删除")


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("用户不存在")
    return user