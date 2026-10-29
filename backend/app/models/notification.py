"""站内通知。

title 存的是**文案快照**：通知是事件记录，图片后来改名或下架不该改写历史文案
（与 audit_logs.reason 同一思路）。
actor_id / image_id 用 SET NULL：通知要比它指向的对象活得久，对象没了通知也要留着。
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, big_fk, big_pk, utcnow

if TYPE_CHECKING:
    from app.models.image import Image
    from app.models.user import User

# type 取值。follow / system 先预留，本轮只发 image_published
NOTIF_IMAGE_PUBLISHED = "image_published"
NOTIF_FOLLOW = "follow"
NOTIF_SYSTEM = "system"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = big_pk()
    user_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    actor_id: Mapped[int | None] = big_fk("users.id", nullable=True, ondelete="SET NULL")
    image_id: Mapped[int | None] = big_fk("images.id", nullable=True, ondelete="SET NULL")

    type: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    # server_default 必须有：fan-out 走 INSERT ... SELECT，不经过 Python 端 default
    is_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    # 两个 FK 都指向 users，必须用 foreign_keys 消歧，否则 SQLAlchemy 无法判断
    actor: Mapped["User | None"] = relationship(foreign_keys=[actor_id], lazy="selectin")
    # 列表要显示作品缩略图，selectin 一次性预加载，避免逐行查
    image: Mapped["Image | None"] = relationship(lazy="selectin")

    __table_args__ = (
        # 一条索引同时服务未读数 COUNT（索引覆盖）与列表分页
        Index("ix_notif_user", "user_id", "is_read", "id"),
    )