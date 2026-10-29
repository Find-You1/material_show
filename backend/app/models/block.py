"""用户屏蔽（双向阻断语义）。

只存「谁屏蔽了谁」一条有向记录，判定时两个方向都要查：
发送前要确认「我没屏蔽对方」且「对方没屏蔽我」，只做单向会造成
「B 显示已发送、A 永远收不到」的最差体验。

ix_block_blocked 是必须的：发消息前要反向检查「对方是否屏蔽了我」，
与 ix_block_blocker 的查询方向相反。
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id: Mapped[int] = big_pk()
    blocker_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    blocked_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uk_block_pair"),
        # 我屏蔽了谁（屏蔽列表）
        Index("ix_block_blocker", "blocker_id", "created_at"),
        # 谁屏蔽了我（发送前的反向检查）
        Index("ix_block_blocked", "blocked_id"),
    )