"""关注关系。

关注数/粉丝数一律实时 COUNT：走 ix_follow_* 的索引覆盖，单机是微秒级，
而且天然正确 —— 冗余计数在用户被物理删除时没有重算节点，会永久漂移。
"""

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.follow import Follow
from app.models.user import User


def get_target(db: Session, username: str) -> User:
    """按用户名取被操作用户。

    不存在与已停用一律返回 404，避免把「这个账号存在但被封了」泄漏出去。
    """
    target = db.scalar(select(User).where(User.username == username))
    if target is None or not target.is_active:
        raise NotFoundError("用户不存在")
    return target


def is_following(db: Session, follower_id: int | None, followee_id: int) -> bool:
    if follower_id is None:
        return False
    return (
        db.scalar(
            select(Follow.id).where(
                Follow.follower_id == follower_id, Follow.followee_id == followee_id
            )
        )
        is not None
    )


def count_following(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
        )
        or 0
    )


def count_followers(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
        )
        or 0
    )


def following_ids(db: Session, viewer_id: int | None, user_ids: Iterable[int]) -> set[int]:
    """当前登录者在这批用户里关注了谁。一次查询搞定，避免逐行判断。"""
    ids = list(user_ids)
    if viewer_id is None or not ids:
        return set()
    rows = db.scalars(
        select(Follow.followee_id).where(
            Follow.follower_id == viewer_id, Follow.followee_id.in_(ids)
        )
    )
    return set(rows)


def follow(db: Session, me: User, target: User) -> tuple[bool, int]:
    """关注。返回 (是否已关注, 目标的最新粉丝数)，同一事务里取，省一次请求。"""
    if me.id == target.id:
        raise BadRequestError("不能关注自己", code="SELF_FOLLOW")

    # 存在屏蔽关系时不允许新关注：被屏蔽者加不了我，我也不该加自己屏蔽的人
    from app.services import message_service

    message_service.guard_follow(db, me, target)

    db.add(Follow(follower_id=me.id, followee_id=target.id))
    try:
        db.commit()
    except IntegrityError:
        # 并发重复关注或重复提交，唯一约束兜底
        db.rollback()
        raise BadRequestError("已经关注过了", code="ALREADY_FOLLOWING") from None
    return True, count_followers(db, target.id)


def unfollow(db: Session, me: User, target: User) -> tuple[bool, int]:
    deleted = db.execute(
        Follow.__table__.delete().where(
            Follow.follower_id == me.id, Follow.followee_id == target.id
        )
    ).rowcount
    if not deleted:
        db.rollback()
        raise BadRequestError("尚未关注该用户", code="NOT_FOLLOWING")

    db.commit()
    return False, count_followers(db, target.id)


def list_followers(
    db: Session, user_id: int, offset: int, limit: int
) -> tuple[list[User], int]:
    """粉丝列表（谁关注了我）。"""
    total = count_followers(db, user_id)
    rows = (
        db.scalars(
            select(User)
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.followee_id == user_id)
            .order_by(Follow.created_at.desc(), Follow.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .all()
    )
    return list(rows), total


def list_following(
    db: Session, user_id: int, offset: int, limit: int
) -> tuple[list[User], int]:
    """关注列表（我关注了谁）。"""
    total = count_following(db, user_id)
    rows = (
        db.scalars(
            select(User)
            .join(Follow, Follow.followee_id == User.id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc(), Follow.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .unique()
        .all()
    )
    return list(rows), total