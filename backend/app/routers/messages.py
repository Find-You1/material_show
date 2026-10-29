"""私信接口。

消息写入走 REST，WebSocket 只做实时推送 —— 所以这里返回的永远是落库后的真值。
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.common import CursorPage, Page
from app.schemas.message import ConversationOut, MessageOut, MessageSendIn
from app.services import follow_service, message_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/api/messages", tags=["messages"])


def _msg_out(row: Message) -> MessageOut:
    return MessageOut(
        id=row.id,
        conversation_id=row.conversation_id,
        sender_id=row.sender_id,
        content=row.content,
        is_read=row.is_read,
        created_at=row.created_at,
    )


@router.get("/conversations", response_model=Page[ConversationOut])
def list_conversations(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> Page[ConversationOut]:
    page, size = page_params(page, size)
    rows, total, unread, peers = message_service.list_conversations(
        db, me.id, (page - 1) * size, size
    )
    items = []
    for conv in rows:
        peer_id = conv.user_b_id if conv.user_a_id == me.id else conv.user_a_id
        peer = peers.get(peer_id)
        if peer is None:
            # 对端被物理删除（FK 是 CASCADE，正常不该出现），跳过这条脏数据
            continue
        items.append(
            ConversationOut(
                id=conv.id,
                peer=peer,
                last_message_preview=conv.last_message_preview,
                last_message_at=conv.last_message_at,
                last_sender_id=conv.last_sender_id,
                unread_count=unread.get(conv.id, 0),
            )
        )
    return Page(items=items, total=total, page=page, size=size)


@router.get("/{username}", response_model=CursorPage[MessageOut])
def list_messages(
    username: str,
    before_id: int | None = Query(None, ge=1),
    after_id: int | None = Query(None, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> CursorPage[MessageOut]:
    """会话内消息，按 id 游标翻页。

    before_id：向上翻历史；after_id：增量补齐（与 before_id 互斥）。都没有则取最新一屏。
    还没聊过（无会话）时返回空页，不报错。
    """
    target = follow_service.get_target(db, username)
    conv = message_service.get_conversation(db, me.id, target.id)
    if conv is None:
        return CursorPage(items=[], has_more=False, next_before_id=None)

    rows, has_more, next_before_id = message_service.list_messages(
        db, conv.id, before_id=before_id, after_id=after_id, limit=limit
    )
    return CursorPage(
        items=[_msg_out(r) for r in rows],
        has_more=has_more,
        next_before_id=next_before_id,
    )


@router.post(
    "/{username}",
    response_model=MessageOut,
    status_code=201,
    dependencies=[Depends(rate_limit("message", 60, 60))],
)
def send_message(
    username: str,
    payload: MessageSendIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> MessageOut:
    target = follow_service.get_target(db, username)
    msg = message_service.send(db, me, target, payload.content)
    # WebSocket 推送在批次 5 接入：落库成功后推给对端与自己（多标签页同步）
    return _msg_out(msg)


@router.post("/{username}/read")
def mark_conversation_read(
    username: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> dict:
    target = follow_service.get_target(db, username)
    conv: Conversation | None = message_service.get_conversation(db, me.id, target.id)
    if conv is None:
        return {"unread_count": 0}
    return {"unread_count": message_service.mark_read(db, conv.id, me.id)}