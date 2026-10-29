"""站内通知 schema。"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserBrief


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    is_read: bool
    created_at: datetime
    actor: UserBrief | None = None
    image_id: int | None = None
    thumb_url: str | None = None


class NotificationReadIn(BaseModel):
    """ids 为 null 表示「全部标记已读」。"""

    ids: list[int] | None = None


class UnreadOut(BaseModel):
    """导航栏红点的汇总，三个数一次拿到，省掉两个请求。"""

    notifications: int = 0
    messages: int = 0
    total: int = 0