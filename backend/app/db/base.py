"""Declarative Base 与公共列工具。"""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """统一用带时区的 UTC 时间（datetime.utcnow() 在 3.12 已弃用）。"""
    return datetime.now(timezone.utc)


def big_pk():
    """BIGINT UNSIGNED 自增主键。"""
    return mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)


def big_fk(target: str, *, nullable: bool = False, ondelete: str | None = None):
    """与 big_pk 类型严格一致的外键列（MySQL 要求 FK 类型完全相同）。"""
    from sqlalchemy import ForeignKey

    return mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(target, ondelete=ondelete) if ondelete else ForeignKey(target),
        nullable=nullable,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )