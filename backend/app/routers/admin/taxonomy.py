"""后台分类与标签管理。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.category import Category
from app.models.image import Image
from app.models.tag import Tag, image_tags
from app.schemas.common import MessageOut, Page
from app.schemas.taxonomy import (
    CategoryCreateIn,
    CategoryOut,
    CategoryUpdateIn,
    TagOut,
    TagUpdateIn,
)
from app.utils.pagination import page_params
from app.utils.slug import slugify

router = APIRouter(prefix="/taxonomy", tags=["admin:taxonomy"])


# ---------------------------------------------------------------- 分类


@router.get("/categories", response_model=Page[CategoryOut])
def list_categories(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1),
    db: Session = Depends(get_db),
) -> Page[CategoryOut]:
    page, size = page_params(page, size, max_size=200)
    total = db.scalar(select(func.count()).select_from(Category)) or 0
    rows = db.scalars(
        select(Category)
        .order_by(Category.sort_order.asc(), Category.id.asc())
        .limit(size)
        .offset((page - 1) * size)
    ).all()
    return Page(items=list(rows), total=total, page=page, size=size)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreateIn, db: Session = Depends(get_db)) -> Category:
    if db.scalar(select(Category.id).where(Category.name == payload.name)):
        raise BadRequestError("分类名已存在")

    slug = _unique_category_slug(db, payload.slug or slugify(payload.name, 50))
    category = Category(
        name=payload.name,
        slug=slug,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(category)
    db.commit()
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdateIn,
    db: Session = Depends(get_db),
) -> Category:
    category = _get_category(db, category_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] != category.name:
        if db.scalar(select(Category.id).where(Category.name == data["name"])):
            raise BadRequestError("分类名已存在")
    if "slug" in data:
        data["slug"] = _unique_category_slug(db, data["slug"] or category.slug, exclude_id=category.id)

    for field, value in data.items():
        setattr(category, field, value)
    db.commit()
    return category


@router.delete("/categories/{category_id}", response_model=MessageOut)
def delete_category(category_id: int, db: Session = Depends(get_db)) -> MessageOut:
    """删除分类。图片的 category_id 由外键 ON DELETE SET NULL 置空，不会牵连图片。"""
    category = _get_category(db, category_id)
    if category.cover_image_id is not None:
        category.cover_image_id = None
        db.flush()
    db.delete(category)
    db.commit()
    return MessageOut(message="已删除，原属于该分类的图片变为未分类")


# ---------------------------------------------------------------- 标签


@router.get("/tags", response_model=Page[TagOut])
def list_tags(
    q: str | None = Query(None, max_length=50),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1),
    db: Session = Depends(get_db),
) -> Page[TagOut]:
    page, size = page_params(page, size, max_size=200)
    conds = []
    if q and q.strip():
        conds.append(Tag.name.like(f"%{q.strip()}%"))

    total = db.scalar(select(func.count()).select_from(Tag).where(*conds)) or 0
    rows = db.scalars(
        select(Tag)
        .where(*conds)
        .order_by(Tag.image_count.desc(), Tag.id.desc())
        .limit(size)
        .offset((page - 1) * size)
    ).all()
    return Page(items=list(rows), total=total, page=page, size=size)


@router.patch("/tags/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, payload: TagUpdateIn, db: Session = Depends(get_db)) -> Tag:
    tag = _get_tag(db, tag_id)
    if payload.name == tag.name:
        return tag
    if db.scalar(select(Tag.id).where(Tag.name == payload.name)):
        raise BadRequestError("标签名已存在")

    tag.name = payload.name
    tag.slug = _unique_tag_slug(db, slugify(payload.name), exclude_id=tag.id)

    # 标签名参与全文索引，改名后必须同步所有关联图片的 tag_text
    _resync_tag_text(db, tag.id)
    db.commit()
    return tag


@router.delete("/tags/{tag_id}", response_model=MessageOut)
def delete_tag(tag_id: int, db: Session = Depends(get_db)) -> MessageOut:
    tag = _get_tag(db, tag_id)
    image_ids = list(db.scalars(select(image_tags.c.image_id).where(image_tags.c.tag_id == tag.id)))
    db.execute(image_tags.delete().where(image_tags.c.tag_id == tag.id))
    db.flush()
    db.delete(tag)
    _resync_tag_text(db, None, image_ids=image_ids)
    db.commit()
    return MessageOut(message="已删除")


# ---------------------------------------------------------------- 内部工具


def _resync_tag_text(db: Session, tag_id: int | None, *, image_ids: list[int] | None = None) -> None:
    """重算受影响图片的 tag_text 冗余列（ngram 全文索引直接依赖这一列）。

    标签改名或删除后不同步的话，搜索会命中已不存在的标签名。
    """
    # sessionmaker 配了 autoflush=False，改名/删除还挂在会话里没落库，
    # 不先 flush 的话下面这条 SELECT 查回来的仍是旧标签名。
    db.flush()

    if image_ids is None:
        image_ids = list(
            db.scalars(select(image_tags.c.image_id).where(image_tags.c.tag_id == tag_id))
        )
    if not image_ids:
        return

    # 一次性取回「图片 id -> 剩余标签名」，避免逐张图查询
    names_by_image: dict[int, list[str]] = {i: [] for i in image_ids}
    for image_id, name in db.execute(
        select(image_tags.c.image_id, Tag.name)
        .join(Tag, Tag.id == image_tags.c.tag_id)
        .where(image_tags.c.image_id.in_(image_ids))
    ):
        names_by_image[image_id].append(name)

    for image in db.scalars(select(Image).where(Image.id.in_(image_ids))):
        image.tag_text = " ".join(sorted(names_by_image.get(image.id, [])))
    db.flush()


def _get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("分类不存在")
    return category


def _get_tag(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError("标签不存在")
    return tag


def _unique_category_slug(db: Session, base: str, *, exclude_id: int | None = None) -> str:
    return _unique_slug(db, Category, base, exclude_id)


def _unique_tag_slug(db: Session, base: str, *, exclude_id: int | None = None) -> str:
    # 标签与分类各用一张表，slug 命名空间互不干扰
    return _unique_slug(db, Tag, base, exclude_id)


def _unique_slug(db: Session, model, base: str, exclude_id: int | None) -> str:
    slug = base
    suffix = 1
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(model.id != exclude_id)
        if db.scalar(stmt) is None:
            return slug
        suffix += 1
        slug = f"{base}-{suffix}"