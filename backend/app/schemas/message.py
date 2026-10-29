"""私信与屏蔽 schema。"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class ConversationOut(BaseModel):
    """会话列表一行。peer 是对端，不是自己。"""

    id: int
    peer: UserBrief
    last_message_preview: str | None = None
    last_message_at: datetime | None = None
    # 前端据此显示「我: xxx」；发送者被物理删除后为 None
    last_sender_id: int | None = None
    unread_count: int = 0


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    is_read: bool
    created_at: datetime


class MessageSendIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class BlockOut(BaseModel):
    is_blocked: bool


class BlockedUserOut(UserBrief):
    """屏蔽列表里的一行：用户信息 + 屏蔽时间。"""

    blocked_at: datetime | None = None
