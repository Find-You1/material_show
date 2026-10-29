"""站内通知接口。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User
from app.models.variant import SIZE_ORIGINAL, SIZE_PREVIEW, SIZE_THUMB
from app.schemas.common import Page
from app.schemas.notification import NotificationOut, NotificationReadIn
from app.services import image_service, notification_service
from app.utils.pagination import page_params

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _to_out(row: Notification) -> NotificationOut:
    image = row.image
    return NotificationOut(
        id=row.id,
        type=row.type,
        title=row.title,
        is_read=row.is_read,
        created_at=row.created_at,
        actor=row.actor,
        image_id=row.image_id,
        # 作品被下架/物理删除后 image 可能为 NULL，此时不给缩略图
        thumb_url=(
            image_service.url_of(image, (SIZE_THUMB, SIZE_PREVIEW, SIZE_ORIGINAL))
            if image is not None
            else None
        ),
    )


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[NotificationOut]:
    page, size = page_params(page, size)
    rows, total = notification_service.list_notifications(
        db, user.id, (page - 1) * size, size
    )
    return Page(items=[_to_out(r) for r in rows], total=total, page=page, size=size)


@router.post("/read")
def mark_read(
    payload: NotificationReadIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {
        "unread_count": notification_service.mark_read(db, user.id, payload.ids)
    }