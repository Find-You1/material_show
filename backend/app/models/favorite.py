"""收藏表。"""

from datetime import datetime

from sqlalchemy import DateTime, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[int] = big_pk()
    user_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    image_id: Mapped[int] = big_fk("images.id", ondelete="CASCADE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "image_id", name="uk_fav_user_image"),
        Index("ix_fav_user", "user_id", "created_at"),
        Index("ix_fav_image", "image_id"),
    )