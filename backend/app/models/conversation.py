"""一对一会话（配对归一化）。

写入前强制 sorted((me, other))，user_a_id 恒为较小 id —— 归一化 + 唯一约束是
「一对用户只有一条会话」的唯一可靠保证：靠先查再插在并发下会写重。

冗余 last_message_* 让会话列表一次查询就能拿到预览与排序键，避免对每条会话
再查一次最新消息（N+1）。
刻意不加 last_message_id 外键：会与 messages 形成循环 FK，MySQL 建表无法排序。
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, big_fk, big_pk


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id: Mapped[int] = big_pk()
    user_a_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    user_b_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")

    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_message_preview: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 前端据此显示「我: xxx」；发送者被物理删除时置空，会话本身保留
    last_sender_id: Mapped[int | None] = big_fk("users.id", nullable=True, ondelete="SET NULL")

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uk_conv_pair"),
        # 会话列表分两半查（a=me / b=me），两个方向各一条索引
        Index("ix_conv_a", "user_a_id", "last_message_at"),
        Index("ix_conv_b", "user_b_id", "last_message_at"),
    )