"""通用响应结构。"""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """统一分页体：{items, total, page, size}，前端无限滚动与表格共用。"""

    items: list[T]
    total: int
    page: int
    size: int


class CursorPage(BaseModel, Generic[T]):
    """游标分页体：{items, has_more, next_before_id}，聊天记录用。

    聊天里不断有新消息插入，offset 在向上翻历史时会漂移，
    所以用 id 游标（before_id）而不是页号。
    """

    items: list[T]
    has_more: bool
    next_before_id: int | None = None


class MessageOut(BaseModel):
    message: str


class IdOut(BaseModel):
    id: int