"""用户表。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.mysql import INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, big_pk

ROLE_USER = "user"
ROLE_ADMIN = "admin"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = big_pk()
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    # avatar_url 是历史外链兼容列（老的手填图片地址仍能用）；
    # 新版头像走上传，库里只存 key + 当时用的后端，URL 一律现算，
    # 这样把 STORAGE_BACKEND 从 local 切到 s3 时老头像也不会 404。
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    avatar_backend: Mapped[str | None] = mapped_column(String(8))
    avatar_key: Mapped[str | None] = mapped_column(String(255))
    bio: Mapped[str | None] = mapped_column(String(255))

    role: Mapped[str] = mapped_column(
        String(10), nullable=False, default=ROLE_USER, server_default=ROLE_USER, index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )

    # 冗余计数，仅在审核节点全量重算
    upload_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    approved_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.id} {self.username}>"