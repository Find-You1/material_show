"""标签表 + 图片-标签关联表。"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Table
from sqlalchemy.dialects.mysql import BIGINT, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, big_pk, utcnow

if TYPE_CHECKING:
    from app.models.image import Image


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = big_pk()
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    image_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    images: Mapped[list["Image"]] = relationship(
        secondary="image_tags", back_populates="tags"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Tag {self.id} {self.slug}>"


# 图片-标签多对多关联表。
# 放在本模块（而不是 image.py）以避免 image.py 与 tag.py 之间的循环导入。
image_tags = Table(
    "image_tags",
    Base.metadata,
    Column(
        "image_id",
        BIGINT(unsigned=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        BIGINT(unsigned=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("created_at", DateTime, default=utcnow, nullable=False),
    Index("ix_image_tags_tag", "tag_id", "image_id"),
)