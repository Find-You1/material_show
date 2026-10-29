"""分类接口。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.category import Category
from app.schemas.taxonomy import CategoryOut

router = APIRouter(prefix="/api/categories", tags=["taxonomy"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    with_count: bool = Query(True, description="是否只返回有图的分类"),
    db: Session = Depends(get_db),
) -> list[Category]:
    stmt = select(Category).order_by(Category.sort_order.asc(), Category.id.asc())
    if with_count:
        stmt = stmt.where(Category.image_count > 0)
    return list(db.scalars(stmt))


@router.get("/{slug}", response_model=CategoryOut)
def get_category(slug: str, db: Session = Depends(get_db)) -> Category:
    category = db.scalar(select(Category).where(Category.slug == slug))
    if category is None:
        raise NotFoundError("分类不存在")
    return category