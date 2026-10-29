"""用户对外信息的装配。

头像 URL 现算：库里只存 avatar_key + avatar_backend，切换 STORAGE_BACKEND 后
老头像仍按各自记录的 backend 读取。avatar_url 只作为历史外链的回落值。
"""

from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserPublic
from app.storage.registry import url_for


def avatar_url_of(user: User) -> str | None:
    key = getattr(user, "avatar_key", None)
    if key:
        return url_for(user.avatar_backend or "local", key)
    return user.avatar_url


def to_public(db: Session, target: User, viewer: User | None) -> UserPublic:
    """个人主页信息。三个社交字段依赖 viewer，所以只能手工装配。

    先 model_validate 走 UserBrief 的 before-validator 把头像算好，
    再用 model_copy 补上关注相关的字段。
    """
    from app.services import follow_service

    base = UserPublic.model_validate(target)
    return base.model_copy(
        update={
            "following_count": follow_service.count_following(db, target.id),
            "follower_count": follow_service.count_followers(db, target.id),
            "is_following": follow_service.is_following(
                db, viewer.id if viewer else None, target.id
            ),
        }
    )