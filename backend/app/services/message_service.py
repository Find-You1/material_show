"""私信与屏蔽。

会话配对归一化：写入前强制 sorted((me, other))，user_a_id 恒为较小 id。
唯一约束 uk_conv_pair 是「一对用户只有一条会话」的唯一可靠保证 —— 先查再插在并发下会写重，
所以这里靠 IntegrityError 兜底，写法与 routers/images.py::add_favorite 一致。

屏蔽取双向阻断语义：发送前要同时确认「我没屏蔽对方」且「对方没屏蔽我」。
"""

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ForbiddenError
from app.models.block import UserBlock
from app.models.conversation import Conversation
from app.models.follow import Follow
from app.models.message import Message
from app.models.user import User

# 会话预览截断到 120（表列长度），超出尾部加省略号
PREVIEW_MAX = 120


def pair_of(me_id: int, other_id: int) -> tuple[int, int]:
    """把两个用户 id 归一化成一个有序对，保证 (a, b) 只有一种写法。"""
    return (me_id, other_id) if me_id < other_id else (other_id, me_id)


# ---------------------------------------------------------------- 屏蔽


def is_blocked_between(db: Session, a_id: int, b_id: int) -> bool:
    """任一方向存在屏蔽即为真。发消息前用它做双向检查。"""
    return (
        db.scalar(
            select(UserBlock.id).where(
                or_(
                    (UserBlock.blocker_id == a_id) & (UserBlock.blocked_id == b_id),
                    (UserBlock.blocker_id == b_id) & (UserBlock.blocked_id == a_id),
                )
            )
        )
        is not None
    )


def block(db: Session, me: User, target: User) -> bool:
    """屏蔽某人。同时删除双向关注关系，避免「已关注 + 已屏蔽」的矛盾态。"""
    if me.id == target.id:
        raise BadRequestError("不能屏蔽自己", code="SELF_BLOCK")

    db.add(UserBlock(blocker_id=me.id, blocked_id=target.id))
    # 顺手清掉双向关注：屏蔽后双方都不该再出现在对方的关注流里
    db.execute(
        Follow.__table__.delete().where(
            or_(
                (Follow.follower_id == me.id) & (Follow.followee_id == target.id),
                (Follow.follower_id == target.id) & (Follow.followee_id == me.id),
            )
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise BadRequestError("已经屏蔽过了", code="ALREADY_BLOCKED") from None
    return True


def unblock(db: Session, me: User, target: User) -> bool:
    deleted = db.execute(
        UserBlock.__table__.delete().where(
            UserBlock.blocker_id == me.id, UserBlock.blocked_id == target.id
        )
    ).rowcount
    if not deleted:
        db.rollback()
        raise BadRequestError("尚未屏蔽该用户", code="NOT_BLOCKED")
    db.commit()
    return False


def list_blocks(
    db: Session, user_id: int, offset: int, limit: int
) -> tuple[list[tuple[User, object]], int]:
    """我屏蔽了谁（屏蔽列表）。返回 [(用户, 屏蔽时间)]。"""
    total = (
        db.scalar(
            select(func.count()).select_from(UserBlock).where(UserBlock.blocker_id == user_id)
        )
        or 0
    )
    rows = db.execute(
        select(User, UserBlock.created_at)
        .join(UserBlock, UserBlock.blocked_id == User.id)
        .where(UserBlock.blocker_id == user_id)
        .order_by(UserBlock.created_at.desc(), UserBlock.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [(user, blocked_at) for user, blocked_at in rows], total


def guard_follow(db: Session, me: User, target: User) -> None:
    """关注前的屏蔽守卫（follow_service 调用）。"""
    if db.scalar(
        select(UserBlock.id).where(
            UserBlock.blocker_id == target.id, UserBlock.blocked_id == me.id
        )
    ):
        raise ForbiddenError("对方已屏蔽你")
    if db.scalar(
        select(UserBlock.id).where(
            UserBlock.blocker_id == me.id, UserBlock.blocked_id == target.id
        )
    ):
        raise BadRequestError("请先解除屏蔽再关注", code="BLOCKED_BY_ME")


# ---------------------------------------------------------------- 会话


def get_conversation(db: Session, a_id: int, b_id: int) -> Conversation | None:
    a, b = pair_of(a_id, b_id)
    return db.scalar(
        select(Conversation).where(
            Conversation.user_a_id == a, Conversation.user_b_id == b
        )
    )


def get_or_create_conversation(db: Session, a_id: int, b_id: int) -> Conversation:
    """取会话，没有就建。并发下靠 uk_conv_pair 兜底，不抛错。"""
    conv = get_conversation(db, a_id, b_id)
    if conv is not None:
        return conv

    a, b = pair_of(a_id, b_id)
    conv = Conversation(user_a_id=a, user_b_id=b)
    db.add(conv)
    try:
        db.flush()
    except IntegrityError:
        # 并发建会话：另一个请求刚插进去，回滚后重新取它
        db.rollback()
        conv = get_conversation(db, a_id, b_id)
        if conv is None:
            raise
    return conv


def _preview(content: str) -> str:
    return content if len(content) <= PREVIEW_MAX else content[: PREVIEW_MAX - 3] + "..."


def send(db: Session, me: User, target: User, content: str) -> Message:
    """发一条私信。返回落库后的 Message（含 id）。"""
    if me.id == target.id:
        raise BadRequestError("不能给自己发消息", code="SELF_MESSAGE")
    if is_blocked_between(db, me.id, target.id):
        # 不区分「我屏蔽了对方」与「对方屏蔽了我」，避免泄漏对方的设置
        raise ForbiddenError("无法发送：你们之间存在屏蔽关系", code="BLOCKED")

    text = (content or "").strip()
    if not text:
        raise BadRequestError("消息内容不能为空", code="EMPTY_CONTENT")

    conv = get_or_create_conversation(db, me.id, target.id)
    msg = Message(conversation_id=conv.id, sender_id=me.id, content=text)
    db.add(msg)
    db.flush()

    # 冗余列一次更新，会话列表就不必再查最新消息（避免 N+1）
    conv.last_message_at = msg.created_at
    conv.last_message_preview = _preview(text)
    conv.last_sender_id = me.id
    db.commit()
    db.refresh(msg)

    # 推送放在 commit 之后：推送失败不能影响发送成功（WS 只做实时性增强）
    _push_message(me.id, target.id, msg)
    return msg


def _push_message(me_id: int, peer_id: int, msg: Message) -> None:
    """推给对端 + 自己（自己的其它标签页也要同步）。

    sender_id 一并带上：前端据此判断「这条是我发的」，多标签页不重复加未读。
    """
    from app.realtime.manager import push_to_users

    push_to_users(
        [me_id, peer_id],
        {
            "type": "message",
            "conversation_id": msg.conversation_id,
            "sender_id": me_id,
            "message": {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "sender_id": me_id,
                "content": msg.content,
                "is_read": msg.is_read,
                "created_at": msg.created_at.isoformat(),
            },
        },
    )


def list_conversations(
    db: Session, me_id: int, offset: int, limit: int
) -> tuple[list[Conversation], int, dict[int, int], dict[int, User]]:
    """会话列表。

    返回 (会话行, 总数, {会话id: 未读数}, {对端id: User})。
    未读数用一次 GROUP BY 聚合，不是逐个会话查（避免 N+1）。
    """
    cond = or_(Conversation.user_a_id == me_id, Conversation.user_b_id == me_id)
    total = db.scalar(select(func.count()).select_from(Conversation).where(cond)) or 0

    rows = list(
        db.scalars(
            select(Conversation)
            .where(cond)
            # 还没说过话的会话（last_message_at 为空）排最后
            .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    if not rows:
        return [], total, {}, {}

    conv_ids = [c.id for c in rows]
    unread_rows = db.execute(
        select(Message.conversation_id, func.count())
        .where(
            Message.conversation_id.in_(conv_ids),
            Message.is_read.is_(False),
            Message.sender_id != me_id,
        )
        .group_by(Message.conversation_id)
    ).all()
    unread = {cid: cnt for cid, cnt in unread_rows}

    peer_ids = [c.user_b_id if c.user_a_id == me_id else c.user_a_id for c in rows]
    peers = {
        u.id: u
        for u in db.scalars(select(User).where(User.id.in_(peer_ids)))
    }
    return rows, total, unread, peers


def list_messages(
    db: Session,
    conversation_id: int,
    *,
    before_id: int | None = None,
    after_id: int | None = None,
    limit: int = 30,
) -> tuple[list[Message], bool, int | None]:
    """会话内消息分页。

    - before_id：向上翻历史（取 limit+1 判 has_more，items 按 id ASC 返回供前端 prepend）
    - after_id：增量补齐（WS 降级 / 重连时拉漏掉的新消息），与 before_id 互斥
    返回 (items, has_more, next_before_id)。
    """
    limit = max(1, min(limit, 100))
    stmt = select(Message).where(Message.conversation_id == conversation_id)

    if after_id is not None:
        # 增量：直接按 id ASC 取，最多 limit 条，不做 has_more 往返
        rows = list(
            db.scalars(stmt.where(Message.id > after_id).order_by(Message.id.asc()).limit(limit))
        )
        return rows, False, None

    if before_id is not None:
        stmt = stmt.where(Message.id < before_id)

    # 多取一条判断还有没有更早的
    rows = list(db.scalars(stmt.order_by(Message.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()  # 转成升序，前端直接 prepend 到列表顶部
    next_before_id = rows[0].id if rows and has_more else None
    return rows, has_more, next_before_id


def mark_read(db: Session, conversation_id: int, me_id: int) -> int:
    """把会话里「别人发给我的未读」标记为已读，返回剩余未读数。"""
    db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.is_read.is_(False),
            Message.sender_id != me_id,
        )
        .values(is_read=True)
    )
    db.commit()
    return count_unread(db, me_id, conversation_id)


def count_unread(db: Session, me_id: int, conversation_id: int | None = None) -> int:
    """未读私信数。conversation_id 为空则统计全部会话。"""
    stmt = select(func.count()).select_from(Message).where(
        Message.is_read.is_(False), Message.sender_id != me_id
    )
    if conversation_id is not None:
        stmt = stmt.where(Message.conversation_id == conversation_id)
    else:
        stmt = stmt.where(
            Message.conversation_id.in_(
                select(Conversation.id).where(
                    or_(Conversation.user_a_id == me_id, Conversation.user_b_id == me_id)
                )
            )
        )
    return db.scalar(stmt) or 0