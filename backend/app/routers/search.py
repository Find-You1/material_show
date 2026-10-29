"""搜索接口。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.image import ImageOut
from app.schemas.user import FollowUserOut
from app.services import follow_service, image_service, search_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=Page[ImageOut])
def search(
    q: str = Query("", max_length=100),
    tags: str | None = Query(None, description="标签 slug，逗号分隔"),
    category: str | None = Query(None, description="分类 slug"),
    order: str = Query("relevance", pattern="^(relevance|latest|popular)$"),
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> Page[ImageOut]:
    page, size = page_params(page, size)

    tag_slugs = [s.strip() for s in (tags or "").split(",") if s.strip()]
    category_id = _category_id(db, category)

    rows, total = search_service.search_images(
        db,
        q,
        tag_slugs=tag_slugs or None,
        category_id=category_id,
        order=order,
        page=page,
        size=size,
    )
    fav = image_service.favorited_ids(db, user.id if user else None, [r.id for r in rows])
    return Page(
        items=[image_service.to_image_out(r, is_favorited=r.id in fav) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/users", response_model=Page[FollowUserOut])
def search_users(
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> Page[FollowUserOut]:
    page, size = page_params(page, size)
    rows, total = search_service.search_users(
        db,
        q,
        offset=(page - 1) * size,
        limit=size,
        viewer_id=user.id if user else None,
    )
    followed = follow_service.following_ids(db, user.id if user else None, [r.id for r in rows])
    return Page(
        items=[
            FollowUserOut.model_validate(r).model_copy(
                update={"is_following": r.id in followed}
            )
            for r in rows
        ],
        total=total,
        page=page,
        size=size,
    )


def _category_id(db: Session, slug: str | None) -> int | None:
    if not slug:
        return None

    from sqlalchemy import select

    from app.models.category import Category

    return db.scalar(select(Category.id).where(Category.slug == slug))