"""用户公开主页与关注关系。

统一用 username 定位：与前端 /u/:username 的路由形态一致，
不用 id 是为了让「主页链接」可读、可直接分享。
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_optional_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.user import FollowUserOut, UserPublic
from app.services import follow_service, message_service, user_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{username}", response_model=UserPublic)
def get_user(
    username: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> UserPublic:
    target = follow_service.get_target(db, username)
    return user_service.to_public(db, target, viewer)


@router.post("/{username}/follow")
def follow_user(
    username: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> dict:
    target = follow_service.get_target(db, username)
    is_following, follower_count = follow_service.follow(db, me, target)
    return {"is_following": is_following, "follower_count": follower_count}


@router.delete("/{username}/follow")
def unfollow_user(
    username: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> dict:
    target = follow_service.get_target(db, username)
    is_following, follower_count = follow_service.unfollow(db, me, target)
    return {"is_following": is_following, "follower_count": follower_count}


@router.post("/{username}/block")
def block_user(
    username: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> dict:
    target = follow_service.get_target(db, username)
    return {"is_blocked": message_service.block(db, me, target)}


@router.delete("/{username}/block")
def unblock_user(
    username: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> dict:
    target = follow_service.get_target(db, username)
    return {"is_blocked": message_service.unblock(db, me, target)}


@router.get("/{username}/followers", response_model=Page[FollowUserOut])
def list_followers(
    username: str,
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> Page[FollowUserOut]:
    page, size = page_params(page, size)
    target = follow_service.get_target(db, username)
    rows, total = follow_service.list_followers(db, target.id, (page - 1) * size, size)
    return Page(
        items=_with_follow_state(db, viewer, rows), total=total, page=page, size=size
    )


@router.get("/{username}/following", response_model=Page[FollowUserOut])
def list_following(
    username: str,
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> Page[FollowUserOut]:
    page, size = page_params(page, size)
    target = follow_service.get_target(db, username)
    rows, total = follow_service.list_following(db, target.id, (page - 1) * size, size)
    return Page(
        items=_with_follow_state(db, viewer, rows), total=total, page=page, size=size
    )


def _with_follow_state(
    db: Session, viewer: User | None, rows: list[User]
) -> list[FollowUserOut]:
    """给列表行补上「当前登录者是否已关注」——一次查询，不逐行判断。"""
    followed = follow_service.following_ids(
        db, viewer.id if viewer else None, [r.id for r in rows]
    )
    return [
        FollowUserOut.model_validate(r).model_copy(update={"is_following": r.id in followed})
        for r in rows
    ]