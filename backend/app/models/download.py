"""下载明细表。游客也能下载，所以 user_id 可空。"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow


class Download(Base):
    __tablename__ = "downloads"

    id: Mapped[int] = big_pk()
    image_id: Mapped[int] = big_fk("images.id", ondelete="CASCADE")
    user_id: Mapped[int | None] = big_fk("users.id", nullable=True, ondelete="SET NULL")
    size_code: Mapped[str] = mapped_column(String(16), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_dl_image", "image_id", "created_at"),
        Index("ix_dl_user", "user_id", "created_at"),
    )