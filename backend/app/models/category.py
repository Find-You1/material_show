"""分类表。"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.mysql import BIGINT, INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
    # 刻意不加外键：images.category_id 已指向本表，再加一条反向 FK 会形成环。
    cover_image_id: Mapped[int | None] = mapped_column(BIGINT(unsigned=True))
    sort_order: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    image_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (Index("ix_categories_sort", "sort_order", "id"),)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Category {self.id} {self.slug}>"