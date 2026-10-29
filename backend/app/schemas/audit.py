"""审核相关 schema。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=255)

    model_config = ConfigDict(str_strip_whitespace=True)


class TakedownIn(BaseModel):
    """下架原因可选，但要留痕。"""

    reason: str | None = Field(default=None, max_length=255)

    model_config = ConfigDict(str_strip_whitespace=True)


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_id: int
    admin_id: int | None = None
    action: str
    from_status: str | None = None
    to_status: str | None = None
    reason: str | None = None
    created_at: datetime


class AuditActionOut(BaseModel):
    id: int
    audit_status: str
    message: str


class AdminImageOut(BaseModel):
    """后台审核队列 / 图片管理用的行，附带作者信息便于判断。"""

    id: int
    title: str
    thumb_url: str
    source: str
    audit_status: str
    process_status: str
    reject_reason: str | None = None
    category_name: str | None = None
    owner_id: int
    owner_name: str
    width: int
    height: int
    created_at: datetime
    published_at: datetime | None = None
    is_deleted: bool