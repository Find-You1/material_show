"""图片查询与序列化。

URL 一律现算：数据库只有 storage_key，所以切换 STORAGE_BACKEND 之后
新图走新后端、老图仍按各自记录的 backend 正常显示。
"""

from collections.abc import Iterable, Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.favorite import Favorite
from app.models.image import PUBLIC_FILTER, Image
from app.models.tag import Tag
from app.models.variant import (
    SIZE_MEDIUM,
    SIZE_ORIGINAL,
    SIZE_PREVIEW,
    SIZE_THUMB,
    ImageVariant,
)
from app.schemas.audit import AdminImageOut
from app.schemas.image import ImageDetailOut, ImageOut, MyUploadOut, VariantOut
from app.schemas.user import UserBrief
from app.storage.registry import url_for

# 列表页都带上这些关系，避免 N+1
_LIST_OPTIONS = (
    selectinload(Image.owner),
    selectinload(Image.category),
    selectinload(Image.tags),
    selectinload(Image.variants),
)


def image_query() -> Select:
    """图片查询起点：预加载全部关联，不做可见性过滤。

    供「我的上传」「后台管理」这类需要看到未审核/已下架/处理失败的场景使用。
    面向浏览端请一律走 public_query()。
    """
    return select(Image).options(*_LIST_OPTIONS)


def public_query() -> Select:
    """浏览端唯一合法的图片查询起点。"""
    return image_query().where(PUBLIC_FILTER)


def variants_by_code(image: Image) -> dict[str, ImageVariant]:
    return {v.size_code: v for v in image.variants}


def _pick(image: Image, codes: Sequence[str]) -> ImageVariant | None:
    by_code = variants_by_code(image)
    for code in codes:
        if code in by_code:
            return by_code[code]
    return None


def url_of(image: Image, codes: Sequence[str], *, download_name: str | None = None) -> str:
    variant = _pick(image, codes)
    if variant is not None:
        return url_for(image.storage_backend, variant.storage_key, download_name=download_name)
    # 还没跑完流水线时退回原图，保证「我的上传」里待处理的图也能显示
    return url_for(image.storage_backend, image.storage_key, download_name=download_name)


def favorited_ids(db: Session, user_id: int | None, image_ids: Iterable[int]) -> set[int]:
    ids = list(image_ids)
    if user_id is None or not ids:
        return set()
    rows = db.scalars(
        select(Favorite.image_id).where(
            Favorite.user_id == user_id, Favorite.image_id.in_(ids)
        )
    )
    return set(rows)


def tag_names(image: Image) -> list[str]:
    return [t.name for t in image.tags]


def to_image_out(image: Image, *, is_favorited: bool = False) -> ImageOut:
    return ImageOut(
        id=image.id,
        title=image.title,
        width=image.width,
        height=image.height,
        dominant_color=image.dominant_color,
        source=image.source,
        published_at=image.published_at,
        created_at=image.created_at,
        owner=UserBrief.model_validate(image.owner),
        category=image.category,
        tags=tag_names(image),
        # thumb 缺失时逐级回退，保证列表页永远有图可显示
        thumb_url=url_of(image, (SIZE_THUMB, SIZE_PREVIEW, SIZE_ORIGINAL)),
        preview_url=url_of(image, (SIZE_PREVIEW, SIZE_MEDIUM, SIZE_ORIGINAL)),
        views_count=image.views_count,
        downloads_count=image.downloads_count,
        favorites_count=image.favorites_count,
        is_favorited=is_favorited,
    )


def to_image_detail(
    image: Image,
    *,
    is_favorited: bool = False,
    include_private: bool = False,
    owner_is_following: bool = False,
) -> ImageDetailOut:
    variants = [
        VariantOut(
            size_code=v.size_code,
            width=v.width,
            height=v.height,
            file_size=v.file_size,
            format=v.format,
            url=url_for(image.storage_backend, v.storage_key),
            download_url=url_for(
                image.storage_backend,
                v.storage_key,
                download_name=download_name_for(image, v),
            ),
        )
        for v in image.variants
    ]

    base = to_image_out(image, is_favorited=is_favorited)
    data = base.model_dump()
    # owner 在详情里是 FollowUserOut，补上当前访问者的关注态
    data["owner"] = {**data["owner"], "is_following": owner_is_following}
    return ImageDetailOut(
        **data,
        description=image.description,
        mime_type=image.mime_type,
        format=image.format,
        file_size=image.file_size,
        storage_backend=image.storage_backend,
        exif=image.exif,
        variants=variants,
        # 审核状态只对作者本人和管理员暴露
        audit_status=image.audit_status if include_private else None,
        process_status=image.process_status if include_private else None,
        reject_reason=image.reject_reason if include_private else None,
    )


def to_my_upload(image: Image) -> MyUploadOut:
    base = to_image_out(image)
    return MyUploadOut(
        **base.model_dump(),
        audit_status=image.audit_status,
        process_status=image.process_status,
        process_error=image.process_error,
        reject_reason=image.reject_reason,
        audited_at=image.audited_at,
        is_deleted=image.is_deleted,
    )


def to_admin_image(image: Image) -> AdminImageOut:
    """后台审核队列 / 图片管理的行。"""
    return AdminImageOut(
        id=image.id,
        title=image.title,
        thumb_url=url_of(image, (SIZE_THUMB, SIZE_PREVIEW, SIZE_ORIGINAL)),
        source=image.source,
        audit_status=image.audit_status,
        process_status=image.process_status,
        reject_reason=image.reject_reason,
        category_name=image.category.name if image.category else None,
        owner_id=image.owner_id,
        owner_name=image.owner.nickname if image.owner else "",
        width=image.width,
        height=image.height,
        created_at=image.created_at,
        published_at=image.published_at,
        is_deleted=image.is_deleted,
    )


def download_name_for(image: Image, variant: ImageVariant) -> str:
    """给用户下载的文件名（去掉文件系统非法字符，避免不同浏览器行为不一致）。"""
    safe_title = "".join(ch for ch in image.title if ch not in '\\/:*?"<>|').strip()
    safe_title = safe_title[:60] or f"image-{image.id}"
    return f"{safe_title}-{variant.size_code}.{variant.format}"


def count_public(db: Session, stmt: Select) -> int:
    """对已构造好的查询做总数统计（去掉排序与分页）。"""
    return db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0


def collect_tags(db: Session, names: Iterable[str]) -> list[Tag]:
    """按名字取标签，不存在则创建。"""
    cleaned: list[str] = []
    for name in names:
        name = (name or "").strip()
        if name and name not in cleaned:
            cleaned.append(name)
    if not cleaned:
        return []

    from app.utils.slug import slugify

    existing = {
        t.name: t for t in db.scalars(select(Tag).where(Tag.name.in_(cleaned)))
    }
    result: list[Tag] = []
    for name in cleaned:
        tag = existing.get(name)
        if tag is None:
            tag = Tag(name=name, slug=_unique_slug(db, slugify(name)))
            db.add(tag)
            existing[name] = tag
        result.append(tag)
    db.flush()
    return result


def _unique_slug(db: Session, base: str) -> str:
    slug = base
    suffix = 1
    while db.scalar(select(Tag.id).where(Tag.slug == slug)) is not None:
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug