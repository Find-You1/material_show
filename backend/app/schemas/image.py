"""图片相关 schema。

URL 一律由服务端根据 storage_key 现算（见 app.storage.registry.url_for），
数据库里只存 key，所以切换存储后端后历史数据仍然可访问。
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import FollowUserOut, UserBrief

# 标签数量上限：太多会稀释全文索引的相关度，也影响详情页排版
MAX_TAGS_PER_IMAGE = 10


class CategoryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class VariantOut(BaseModel):
    size_code: str
    width: int
    height: int
    file_size: int
    format: str
    url: str
    download_url: str


class ImageOut(BaseModel):
    """瀑布流列表项。width/height 必须返回，前端靠它预算布局、避免重排跳动。"""

    id: int
    title: str
    width: int
    height: int
    dominant_color: str | None = None
    source: str
    published_at: datetime | None = None
    created_at: datetime
    owner: UserBrief
    category: CategoryBrief | None = None
    tags: list[str] = Field(default_factory=list)
    thumb_url: str
    preview_url: str
    views_count: int
    downloads_count: int
    favorites_count: int
    is_favorited: bool = False


class ImageDetailOut(ImageOut):
    # 详情页作者那一行要放关注按钮，所以 owner 比列表多一个 is_following
    owner: FollowUserOut
    description: str | None = None
    mime_type: str
    format: str
    file_size: int
    storage_backend: str
    exif: dict[str, Any] | None = None
    variants: list[VariantOut] = Field(default_factory=list)
    # 以下三个字段只对作者本人和管理员有意义
    audit_status: str | None = None
    process_status: str | None = None
    reject_reason: str | None = None


class MyUploadOut(ImageOut):
    """「我的上传」列表项：作者需要看到审核状态与驳回原因。"""

    audit_status: str
    process_status: str
    process_error: str | None = None
    reject_reason: str | None = None
    audited_at: datetime | None = None
    is_deleted: bool = False


class ImageCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category_id: int | None = None
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS_PER_IMAGE)

    model_config = ConfigDict(str_strip_whitespace=True)


class ImageUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category_id: int | None = None
    tags: list[str] | None = Field(default=None, max_length=MAX_TAGS_PER_IMAGE)

    model_config = ConfigDict(str_strip_whitespace=True)


class UploadResultOut(BaseModel):
    """上传后立即返回，此时图片还在后台处理队列里。"""

    id: int
    process_status: str
    audit_status: str
    message: str


class ProcessStatusOut(BaseModel):
    id: int
    process_status: str
    process_error: str | None = None
    width: int
    height: int
    variants_ready: int