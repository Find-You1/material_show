"""审核队列与状态流转。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.image import (
    AUDIT_APPROVED,
    AUDIT_PENDING,
    AUDIT_REJECTED,
    PROC_FAILED,
    PROC_PROCESSING,
    PROC_QUEUED,
    PROC_READY,
    Image,
)
from app.models.user import User
from app.schemas.audit import AdminImageOut, AuditActionOut, AuditLogOut, RejectIn
from app.schemas.common import Page
from app.schemas.image import ImageDetailOut
from app.services import audit_service, image_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/audit", tags=["admin:audit"])


@router.get("/stats")
def audit_stats(db: Session = Depends(get_db)) -> dict:
    """后台首页数字。"""

    def count(*conds) -> int:
        return db.scalar(select(func.count()).select_from(Image).where(*conds)) or 0

    return {
        "pending": count(Image.audit_status == AUDIT_PENDING),
        "approved": count(Image.audit_status == AUDIT_APPROVED, Image.is_deleted.is_(False)),
        "rejected": count(Image.audit_status == AUDIT_REJECTED),
        "taken_down": count(Image.is_deleted.is_(True)),
        "queued": count(Image.process_status == PROC_QUEUED),
        "processing": count(Image.process_status == PROC_PROCESSING),
        "failed": count(Image.process_status == PROC_FAILED),
        "ready": count(Image.process_status == PROC_READY),
    }


@router.get("", response_model=Page[AdminImageOut])
def list_queue(
    status: str | None = Query(
        AUDIT_PENDING, pattern="^(pending|approved|rejected|all)$"
    ),
    source: str | None = Query(None, pattern="^(official|community)$"),
    q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
) -> Page[AdminImageOut]:
    page, size = page_params(page, size, max_size=100)

    conds = []
    if status and status != "all":
        conds.append(Image.audit_status == status)
    if source:
        conds.append(Image.source == source)
    if q and q.strip():
        conds.append(Image.title.like(f"%{q.strip()}%"))

    total = db.scalar(select(func.count()).select_from(Image).where(*conds)) or 0

    # 待审核按提交时间正序（先来先审）；其他状态按最新处理倒序
    order = (
        (Image.created_at.asc(), Image.id.asc())
        if status == AUDIT_PENDING
        else (Image.id.desc(),)
    )
    rows = (
        db.scalars(
            image_service.image_query()
            .where(*conds)
            .order_by(*order)
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
def get_review_detail(image_id: int, db: Session = Depends(get_db)) -> ImageDetailOut:
    image = _get_image(db, image_id)
    return image_service.to_image_detail(image, include_private=True)


@router.get("/{image_id}/logs", response_model=list[AuditLogOut])
def list_logs(image_id: int, db: Session = Depends(get_db)) -> list[AuditLog]:
    _get_image(db, image_id)
    return list(
        db.scalars(
            select(AuditLog)
            .where(AuditLog.image_id == image_id)
            .order_by(AuditLog.id.desc())
        )
    )


@router.post("/{image_id}/approve", response_model=AuditActionOut)
def approve(
    image_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AuditActionOut:
    image = _get_image(db, image_id)
    audit_service.approve(db, image, admin)
    return AuditActionOut(id=image.id, audit_status=image.audit_status, message="已通过")


@router.post("/{image_id}/reject", response_model=AuditActionOut)
def reject(
    image_id: int,
    payload: RejectIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AuditActionOut:
    image = _get_image(db, image_id)
    audit_service.reject(db, image, admin, payload.reason)
    return AuditActionOut(
        id=image.id, audit_status=image.audit_status, message="已驳回并通知作者"
    )


def _get_image(db: Session, image_id: int) -> Image:
    image = db.get(Image, image_id)
    if image is None:
        raise NotFoundError("图片不存在")
    return image