"""审核日志：所有状态流转都留痕，admin_id 为空表示用户重新提交。"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow

ACTION_APPROVE = "approve"
ACTION_REJECT = "reject"
ACTION_TAKEDOWN = "takedown"
ACTION_RESTORE = "restore"
ACTION_RESUBMIT = "resubmit"
ACTION_EDIT = "edit"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = big_pk()
    image_id: Mapped[int] = big_fk("images.id", ondelete="CASCADE")
    admin_id: Mapped[int | None] = big_fk("users.id", nullable=True, ondelete="SET NULL")
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str | None] = mapped_column(String(16))
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (Index("ix_audit_image", "image_id", "created_at"),)