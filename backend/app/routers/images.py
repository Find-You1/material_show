"""浏览端图片接口：公共区列表、详情、下载、收藏。"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_optional_user
from app.core.errors import BadRequestError, NotFoundError, UnauthorizedError
from app.db.session import get_db
from app.models.category import Category
from app.models.download import Download
from app.models.favorite import Favorite
from app.models.follow import Follow
from app.models.image import PUBLIC_FILTER, Image
from app.models.tag import Tag, image_tags
from app.models.user import User
from app.models.variant import SIZE_ORIGINAL
from app.schemas.common import Page
from app.schemas.image import ImageDetailOut, ImageOut
from app.services import follow_service, image_service
from app.storage.registry import url_for
from app.utils.pagination import page_params

router = APIRouter(prefix="/api/images", tags=["images"])

_ORDER_BY = {
    "latest": (Image.published_at.desc(), Image.id.desc()),
    "popular": (Image.favorites_count.desc(), Image.downloads_count.desc(), Image.id.desc()),
    "downloads": (Image.downloads_count.desc(), Image.id.desc()),
    "views": (Image.views_count.desc(), Image.id.desc()),
}


@router.get("", response_model=Page[ImageOut])
def list_images(
    category: str | None = Query(None, description="分类 slug"),
    tag: str | None = Query(None, description="标签 slug"),
    owner: str | None = Query(None, description="作者用户名"),
    scope: str | None = Query(None, pattern="^(following|all)$", description="following=只看已关注作者"),
    order: str = Query("latest"),
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> Page[ImageOut]:
    page, size = page_params(page, size)

    stmt = image_service.public_query()

    if scope == "following":
        if user is None:
            raise UnauthorizedError(message="请先登录后查看关注流")
        # 用 IN(子查询) 而不是 join(Follow)：join 会与下面的 Category/User join
        # 叠加放大行数，子查询不放大且 MySQL 8 会做半连接优化
        stmt = stmt.where(
            Image.owner_id.in_(
                select(Follow.followee_id).where(Follow.follower_id == user.id)
            )
        )

    if category:
        stmt = stmt.join(Category, Category.id == Image.category_id).where(
            Category.slug == category
        )

    if tag:
        # 交集过滤，走 ix_image_tags_tag
        stmt = stmt.where(
            Image.id.in_(
                select(image_tags.c.image_id)
                .join(Tag, Tag.id == image_tags.c.tag_id)
                .where(Tag.slug == tag)
            )
        )

    if owner:
        from app.models.user import User as UserModel

        stmt = stmt.join(UserModel, UserModel.id == Image.owner_id).where(
            UserModel.username == owner
        )

    total = image_service.count_public(db, stmt)
    rows = (
        db.scalars(stmt.order_by(*_ORDER_BY.get(order, _ORDER_BY["latest"]))
                   .limit(size)
                   .offset((page - 1) * size))
        .unique()
        .all()
    )
    fav = image_service.favorited_ids(db, user.id if user else None, [r.id for r in rows])
    return Page(
        items=[image_service.to_image_out(r, is_favorited=r.id in fav) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{image_id}", response_model=ImageDetailOut)
def get_image(
    image_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> ImageDetailOut:
    image = db.get(Image, image_id)
    if image is None:
        raise NotFoundError("图片不存在")

    # 作者本人和管理员可以看未公开/已下架的图
    privileged = user is not None and (user.id == image.owner_id or user.is_admin)
    if not privileged and (
        image.audit_status != "approved" or image.is_deleted or image.process_status != "ready"
    ):
        raise NotFoundError("图片不存在或已下架")

    if not privileged:
        # 浏览量不做去重，需要防刷时再加日级去重表
        db.execute(
            update(Image).where(Image.id == image.id).values(views_count=Image.views_count + 1)
        )
        db.commit()
        image.views_count += 1

    fav = image_service.favorited_ids(db, user.id if user else None, [image.id])
    owner_is_following = follow_service.is_following(
        db, user.id if user else None, image.owner_id
    )
    return image_service.to_image_detail(
        image,
        is_favorited=image.id in fav,
        include_private=privileged,
        owner_is_following=owner_is_following,
    )


@router.post("/{image_id}/favorite")
def add_favorite(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    image = _require_public(db, image_id)

    db.add(Favorite(user_id=user.id, image_id=image.id))
    try:
        # 明细与计数在同一事务里提交，避免计数漂移
        db.execute(
            update(Image)
            .where(Image.id == image.id)
            .values(favorites_count=Image.favorites_count + 1)
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise BadRequestError("已经收藏过了", code="ALREADY_FAVORITED")

    db.refresh(image)
    return {"is_favorited": True, "favorites_count": image.favorites_count}


@router.delete("/{image_id}/favorite")
def remove_favorite(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    deleted = db.execute(
        Favorite.__table__.delete().where(
            Favorite.user_id == user.id, Favorite.image_id == image_id
        )
    ).rowcount
    if not deleted:
        db.rollback()
        raise BadRequestError("尚未收藏该图片", code="NOT_FAVORITED")

    db.execute(
        update(Image)
        .where(Image.id == image_id, Image.favorites_count > 0)
        .values(favorites_count=Image.favorites_count - 1)
    )
    db.commit()
    image = db.get(Image, image_id)
    return {"is_favorited": False, "favorites_count": image.favorites_count if image else 0}


@router.post("/{image_id}/download")
def download_image(
    image_id: int,
    request: Request,
    variant: str = Query(SIZE_ORIGINAL, description="thumb / preview / medium / original"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> dict:
    image = _require_public(db, image_id)

    by_code = image_service.variants_by_code(image)
    target = by_code.get(variant)
    if target is None:
        # 档位还没生成好时退回原图，避免下载按钮直接报错
        target = by_code.get(SIZE_ORIGINAL)
    if target is None:
        raise BadRequestError("图片尚未处理完成，请稍后再试")

    db.add(
        Download(
            image_id=image.id,
            user_id=user.id if user else None,
            size_code=target.size_code,
            ip=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:255],
        )
    )
    db.execute(
        update(Image)
        .where(Image.id == image.id)
        .values(downloads_count=Image.downloads_count + 1)
    )
    db.commit()

    filename = image_service.download_name_for(image, target)
    return {
        "url": url_for(
            image.storage_backend, target.storage_key, download_name=filename
        ),
        "size_code": target.size_code,
        "filename": filename,
        "width": target.width,
        "height": target.height,
    }


def _require_public(db: Session, image_id: int) -> Image:
    image = db.scalar(select(Image).where(Image.id == image_id, PUBLIC_FILTER))
    if image is None:
        raise NotFoundError("图片不存在或已下架")
    return image