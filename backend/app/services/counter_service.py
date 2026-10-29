"""计数维护。

规则：
- 浏览/下载/收藏这类高频计数一律用原子 UPDATE 自增，禁止「读出来 +1 再写回」。
- tags/categories/users 的冗余计数只在审核通过、下架、删除这三个节点全量重算，
  单机数据量下秒级完成，比增量维护可靠得多。
"""

from collections.abc import Iterable

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.image import PUBLIC_FILTER, Image
from app.models.tag import Tag, image_tags
from app.models.user import User


def refresh_tags(db: Session, tag_ids: Iterable[int]) -> None:
    ids = [i for i in dict.fromkeys(tag_ids) if i is not None]
    if not ids:
        return
    count_sq = (
        select(func.count())
        .select_from(image_tags)
        .join(Image, Image.id == image_tags.c.image_id)
        .where(image_tags.c.tag_id == Tag.id, PUBLIC_FILTER)
        .scalar_subquery()
    )
    db.execute(update(Tag).where(Tag.id.in_(ids)).values(image_count=count_sq))


def refresh_categories(db: Session, category_ids: Iterable[int]) -> None:
    ids = [i for i in dict.fromkeys(category_ids) if i is not None]
    if not ids:
        return
    count_sq = (
        select(func.count())
        .select_from(Image)
        .where(Image.category_id == Category.id, PUBLIC_FILTER)
        .scalar_subquery()
    )
    db.execute(update(Category).where(Category.id.in_(ids)).values(image_count=count_sq))


def refresh_users(db: Session, user_ids: Iterable[int]) -> None:
    ids = [i for i in dict.fromkeys(user_ids) if i is not None]
    if not ids:
        return
    upload_sq = (
        select(func.count())
        .select_from(Image)
        .where(Image.owner_id == User.id, Image.is_deleted.is_(False))
        .scalar_subquery()
    )
    approved_sq = (
        select(func.count())
        .select_from(Image)
        .where(Image.owner_id == User.id, PUBLIC_FILTER)
        .scalar_subquery()
    )
    db.execute(
        update(User)
        .where(User.id.in_(ids))
        .values(upload_count=upload_sq, approved_count=approved_sq)
    )


def refresh_for_image(db: Session, image: Image) -> None:
    """图片进入/离开公开集合时，重算它牵扯到的所有冗余计数。"""
    refresh_tags(db, [t.id for t in image.tags])
    refresh_categories(db, [image.category_id])
    refresh_users(db, [image.owner_id])


def refresh_all(db: Session) -> None:
    """全量重算，供后台维护或种子数据使用。"""
    tag_ids = list(db.scalars(select(Tag.id)))
    cat_ids = list(db.scalars(select(Category.id)))
    user_ids = list(db.scalars(select(User.id)))
    refresh_tags(db, tag_ids)
    refresh_categories(db, cat_ids)
    refresh_users(db, user_ids)