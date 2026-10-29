"""私信消息。

is_read 只对接收方有意义；标记已读 = 更新 conversation_id 下 is_read=0 且
sender_id <> 我的行。纯文本，不做 kind 字段（将来加图片消息再补）。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = big_pk()
    conversation_id: Mapped[int] = big_fk("conversations.id", ondelete="CASCADE")
    sender_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    content: Mapped[str] = mapped_column(String(2000), nullable=False)
    # server_default 必须有：批量标记已读是 UPDATE，不经过 Python 端 default
    is_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        # 会话内按 id 游标翻页
        Index("ix_msg_conv", "conversation_id", "id"),
        # 会话未读数 COUNT
        Index("ix_msg_conv_read", "conversation_id", "is_read"),
    )