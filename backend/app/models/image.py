"""图片主表。

设计要点：
- tag_text 是标签名的冗余拼接串，与 title/description 一起进 ngram 全文索引，
  这样一次 MATCH 就能同时命中标题、描述、标签三处，
  避免 `MATCH(...) OR t.name LIKE ...` 让全文索引失效退化成全表扫描。
- width/height 必须落库：前端瀑布流用它预算布局，不必等图片加载完，从根上消除重排跳动。
- storage_backend 记录写入时所用的后端，切换 STORAGE_BACKEND 后老图仍能从原后端读取。
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, CHAR, DateTime, ForeignKey, Index, String, Text, and_
from sqlalchemy.dialects.mysql import BIGINT, INTEGER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, big_fk, big_pk
from app.models.tag import image_tags

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.tag import Tag
    from app.models.user import User
    from app.models.variant import ImageVariant

# ---- 来源 ----
SOURCE_OFFICIAL = "official"      # 管理员发布，直接进公共区
SOURCE_COMMUNITY = "community"    # 注册用户上传，需审核

# ---- 审核状态 ----
AUDIT_PENDING = "pending"
AUDIT_APPROVED = "approved"
AUDIT_REJECTED = "rejected"

# ---- 处理状态 ----
PROC_QUEUED = "queued"
PROC_PROCESSING = "processing"
PROC_READY = "ready"
PROC_FAILED = "failed"


class Image(Base, TimestampMixin):
    __tablename__ = "images"

    id: Mapped[int] = big_pk()
    owner_id: Mapped[int] = big_fk("users.id")

    # ---- 内容 ----
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    tag_text: Mapped[str] = mapped_column(
        String(512), nullable=False, default="", server_default=""
    )
    category_id: Mapped[int | None] = mapped_column(
        INTEGER(unsigned=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )

    # ---- 来源与状态 ----
    source: Mapped[str] = mapped_column(
        String(10), nullable=False, default=SOURCE_COMMUNITY, server_default=SOURCE_COMMUNITY
    )
    audit_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AUDIT_PENDING, server_default=AUDIT_PENDING
    )
    reject_reason: Mapped[str | None] = mapped_column(String(255))
    process_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=PROC_QUEUED, server_default=PROC_QUEUED
    )
    process_error: Mapped[str | None] = mapped_column(String(255))
    audited_by: Mapped[int | None] = big_fk("users.id", nullable=True, ondelete="SET NULL")
    audited_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ---- 属性 ----
    width: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    height: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    file_size: Mapped[int] = mapped_column(
        BIGINT(unsigned=True), nullable=False, default=0, server_default="0"
    )
    mime_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="image/jpeg", server_default="image/jpeg"
    )
    format: Mapped[str] = mapped_column(
        String(10), nullable=False, default="jpeg", server_default="jpeg"
    )
    storage_backend: Mapped[str] = mapped_column(
        String(8), nullable=False, default="local", server_default="local"
    )
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    dominant_color: Mapped[str | None] = mapped_column(CHAR(7))
    exif: Mapped[dict | None] = mapped_column(JSON)

    # ---- 计数（一律原子自增，禁止读改写） ----
    views_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    downloads_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )
    favorites_count: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=0, server_default="0"
    )

    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ---- 关系 ----
    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])
    category: Mapped["Category | None"] = relationship()
    tags: Mapped[list["Tag"]] = relationship(
        secondary=image_tags, back_populates="images", lazy="selectin"
    )
    variants: Mapped[list["ImageVariant"]] = relationship(
        back_populates="image",
        cascade="all, delete-orphan",
        order_by="ImageVariant.id",
        lazy="selectin",
    )

    __table_args__ = (
        # 中文全文检索：MySQL 服务端 ngram_token_size 默认 2，正好适配中文。
        # 注意 MATCH 的列清单必须与这里完全一致，否则报 ERROR 1191。
        # autogenerate 容易丢掉 WITH PARSER，所以实际索引在 alembic 迁移里手写创建，
        # env.py 的 include_object 会把这个索引排除掉以免反复增删。
        Index(
            "ft_images_search",
            "title",
            "description",
            "tag_text",
            mysql_prefix="FULLTEXT",
            mysql_with_parser="ngram",
        ),
        Index("ix_images_feed", "audit_status", "is_deleted", "published_at"),
        Index("ix_images_owner", "owner_id", "created_at"),
        Index("ix_images_category", "category_id", "audit_status"),
        Index("ix_images_status_created", "audit_status", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Image {self.id} {self.audit_status}>"


# 公开可见的唯一判定条件，所有面向浏览端的查询都必须复用。
PUBLIC_FILTER = and_(
    Image.audit_status == AUDIT_APPROVED,
    Image.is_deleted.is_(False),
    Image.process_status == PROC_READY,
)