"""标签接口。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.tag import Tag
from app.schemas.taxonomy import TagOut
from app.services import search_service

router = APIRouter(prefix="/api/tags", tags=["taxonomy"])


@router.get("", response_model=list[TagOut])
def list_tags(
    keyword: str | None = Query(None, max_length=50),
    limit: int = Query(30, ge=1, le=100),
    only_used: bool = Query(True, description="只返回有关联图片的标签"),
    db: Session = Depends(get_db),
) -> list[Tag]:
    if keyword and keyword.strip():
        return search_service.suggest_tags(db, keyword, limit=limit)

    stmt = select(Tag).order_by(Tag.image_count.desc(), Tag.id.desc()).limit(limit)
    if only_used:
        stmt = stmt.where(Tag.image_count > 0)
    return list(db.scalars(stmt))


@router.get("/{slug}", response_model=TagOut)
def get_tag(slug: str, db: Session = Depends(get_db)) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.slug == slug))
    if tag is None:
        raise NotFoundError("标签不存在")
    return tag