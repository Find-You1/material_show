"""站内通知：fan-out 与读取。

fan-out 收口在这一个函数里，两个触发点共用：
- services/audit_service.py::approve() —— 管理员在审核队列通过（HTTP 线程）
- imaging/pipeline.py 的 becomes_public 分支 —— 管理员上传自动通过（图片处理线程池）
"""

from sqlalchemy import func, insert, literal, select, update
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.follow import Follow
from app.models.image import Image
from app.models.notification import NOTIF_IMAGE_PUBLISHED, Notification


def fanout_image_published(db: Session, image: Image) -> list[int]:
    """给所有关注者发「TA 发布了新作品」，返回接收者 id（供后续实时推送）。

    调用方负责 commit，且必须与图片状态变更同事务 —— 否则会出现「图已公开但通知没发」。

    落库用一条 INSERT ... SELECT，不做逐条循环：
    粉丝上万时逐条 add 会生成上万个 INSERT，事务与内存都不可控。
    """
    receiver_ids = list(
        db.scalars(select(Follow.follower_id).where(Follow.followee_id == image.owner_id))
    )
    # 自关注已被业务拦住，这里再排除一次，防御脏数据
    receiver_ids = [uid for uid in receiver_ids if uid != image.owner_id]
    if not receiver_ids:
        return []

    owner_name = (image.owner.nickname if image.owner else "") or "你关注的作者"
    title = f"{owner_name} 发布了新作品《{image.title}》"[:120]

    db.execute(
        insert(Notification).from_select(
            ["user_id", "actor_id", "image_id", "type", "title", "is_read", "created_at"],
            select(
                Follow.follower_id,
                literal(image.owner_id),
                literal(image.id),
                literal(NOTIF_IMAGE_PUBLISHED),
                literal(title),
                literal(False),
                literal(utcnow()),
            ).where(
                Follow.followee_id == image.owner_id,
                Follow.follower_id != image.owner_id,
            ),
        )
    )
    return receiver_ids


def count_unread(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        or 0
    )


def list_notifications(
    db: Session, user_id: int, offset: int, limit: int
) -> tuple[list[Notification], int]:
    total = (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id)
        )
        or 0
    )
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(rows), total


def mark_read(db: Session, user_id: int, ids: list[int] | None) -> int:
    """标记已读，ids 为空表示全部。返回操作后的未读数。"""
    stmt = update(Notification).where(
        Notification.user_id == user_id, Notification.is_read.is_(False)
    )
    if ids:
        # 带上 user_id 条件，别人的通知 id 传进来也改不动
        stmt = stmt.where(Notification.id.in_(ids))
    db.execute(stmt.values(is_read=True))
    db.commit()
    return count_unread(db, user_id)