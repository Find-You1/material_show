"""图片多档尺寸表。

单独建表而不在 images 里堆多列 URL 的原因：
尺寸档位是「数据」不是 schema，加档不用改表；支持部分成功/失败重试；避免主表膨胀。
"""

from typing import TYPE_CHECKING

from sqlalchemy import Index, String, UniqueConstraint
from sqlalchemy.dialects.mysql import BIGINT, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, big_fk, big_pk

if TYPE_CHECKING:
    from app.models.image import Image

# 尺寸代号
SIZE_THUMB = "thumb"
SIZE_PREVIEW = "preview"
SIZE_MEDIUM = "medium"
SIZE_ORIGINAL = "original"


class ImageVariant(Base):
    __tablename__ = "image_variants"

    id: Mapped[int] = big_pk()
    image_id: Mapped[int] = big_fk("images.id", ondelete="CASCADE")
    size_code: Mapped[str] = mapped_column(String(16), nullable=False)
    width: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    height: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False, default=0)
    file_size: Mapped[int] = mapped_column(BIGINT(unsigned=True), nullable=False, default=0)
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="jpeg")
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)

    image: Mapped["Image"] = relationship(back_populates="variants")

    __table_args__ = (
        UniqueConstraint("image_id", "size_code", name="uk_variant_image_size"),
        Index("ix_variant_image", "image_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ImageVariant {self.image_id} {self.size_code}>"