"""后台图片管理：全量查看、编辑、下架、恢复、重新处理。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.image import (
    PROC_QUEUED,
    PROC_READY,
    Image,
)
from app.models.user import User
from app.schemas.audit import AdminImageOut, AuditActionOut, TakedownIn
from app.schemas.common import MessageOut, Page
from app.schemas.image import ImageDetailOut, ImageUpdateIn
from app.services import audit_service, counter_service, image_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/images", tags=["admin:images"])


@router.get("", response_model=Page[AdminImageOut])
def list_images(
    audit_status: str | None = Query(None, pattern="^(pending|approved|rejected)$"),
    process_status: str | None = Query(None, pattern="^(queued|processing|ready|failed)$"),
    source: str | None = Query(None, pattern="^(official|community)$"),
    taken_down: bool | None = Query(None, description="true 只看已下架"),
    q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
) -> Page[AdminImageOut]:
    page, size = page_params(page, size, max_size=100)

    conds = []
    if audit_status:
        conds.append(Image.audit_status == audit_status)
    if process_status:
        conds.append(Image.process_status == process_status)
    if source:
        conds.append(Image.source == source)
    if taken_down is not None:
        conds.append(Image.is_deleted.is_(taken_down))
    if q and q.strip():
        conds.append(Image.title.like(f"%{q.strip()}%"))

    total = db.scalar(select(func.count()).select_from(Image).where(*conds)) or 0
    rows = (
        db.scalars(
            image_service.image_query()
            .where(*conds)
            .order_by(Image.id.desc())
            .limit(size)
            .offset((page - 1) * size)
        )
        .unique()
        .all()
    )
    return Page(
        items=[image_service.to_admin_image(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{image_id}", response_model=ImageDetailOut)
def get_image(image_id: int, db: Session = Depends(get_db)) -> ImageDetailOut:
    return image_service.to_image_detail(_get_image(db, image_id), include_private=True)


@router.patch("/{image_id}", response_model=AdminImageOut)
def update_image(
    image_id: int,
    payload: ImageUpdateIn,
    db: Session = Depends(get_db),
) -> AdminImageOut:
    image = _get_image(db, image_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("tags") is not None:
        image.tags = image_service.collect_tags(db, data.pop("tags"))
        image.tag_text = " ".join(sorted(t.name for t in image.tags))
    data.pop("tags", None)

    for field, value in data.items():
        setattr(image, field, value)

    db.flush()
    counter_service.refresh_for_image(db, image)
    db.commit()
    return image_service.to_admin_image(image)


@router.post("/{image_id}/takedown", response_model=AuditActionOut)
def takedown(
    image_id: int,
    payload: TakedownIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AuditActionOut:
    image = _get_image(db, image_id)
    audit_service.takedown(db, image, admin, payload.reason)
    return AuditActionOut(id=image.id, audit_status=image.audit_status, message="已下架")


@router.post("/{image_id}/restore", response_model=AuditActionOut)
def restore(
    image_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AuditActionOut:
    image = _get_image(db, image_id)
    audit_service.restore(db, image, admin)
    return AuditActionOut(id=image.id, audit_status=image.audit_status, message="已恢复")


@router.post("/{image_id}/reprocess", response_model=MessageOut)
def reprocess(image_id: int, db: Session = Depends(get_db)) -> MessageOut:
    image = _get_image(db, image_id)
    if image.process_status == PROC_READY:
        raise BadRequestError("该图片已处理完成，无需重新处理")

    db.execute(
        update(Image)
        .where(Image.id == image.id)
        .values(process_status=PROC_QUEUED, process_error=None)
    )
    db.commit()

    from app.tasks.runner import submit_image_job

    submit_image_job(image.id)
    return MessageOut(message="已重新排队处理")


@router.delete("/{image_id}", response_model=MessageOut)
def delete_image(image_id: int, db: Session = Depends(get_db)) -> MessageOut:
    """软删除：保留审计日志与外链降级页，不做物理删文件。"""
    image = _get_image(db, image_id)
    image.is_deleted = True
    db.flush()
    counter_service.refresh_for_image(db, image)
    db.commit()
    return MessageOut(message="已删除")


def _get_image(db: Session, image_id: int) -> Image:
    image = db.get(Image, image_id)
    if image is None:
        raise NotFoundError("图片不存在")
    return image