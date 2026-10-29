"""审核状态机。

                   上传 / 管理员发布
                          │
                       [pending] ──通过──> [approved]  (published_at=now, 进入公共区)
                          │  ▲                    │
              驳回(原因必填) │  │ 用户改完 resubmit      │ 管理员下架
                          ▼  │                    ▼
                      [rejected] ──直接通过──>  is_deleted=1 (可 restore)

approved 不回退到 pending：下架用 is_deleted 标记，保留外链与统计数据。
"""

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.db.base import utcnow
from app.models.audit import (
    ACTION_APPROVE,
    ACTION_REJECT,
    ACTION_RESUBMIT,
    ACTION_RESTORE,
    ACTION_TAKEDOWN,
    AuditLog,
)
from app.models.image import (
    AUDIT_APPROVED,
    AUDIT_PENDING,
    AUDIT_REJECTED,
    PROC_READY,
    Image,
)
from app.models.user import User
from app.services import counter_service, notification_service


def _log(
    db: Session,
    image: Image,
    *,
    action: str,
    from_status: str | None,
    to_status: str | None,
    admin_id: int | None = None,
    reason: str | None = None,
) -> None:
    db.add(
        AuditLog(
            image_id=image.id,
            admin_id=admin_id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
        )
    )


def approve(db: Session, image: Image, admin: User) -> None:
    if image.audit_status == AUDIT_APPROVED and not image.is_deleted:
        raise BadRequestError("该图片已处于公开状态")
    if image.process_status != PROC_READY:
        raise BadRequestError("图片还在处理中，请稍后再试")

    from_status = image.audit_status
    image.audit_status = AUDIT_APPROVED
    image.reject_reason = None
    image.audited_by = admin.id
    image.audited_at = utcnow()
    image.is_deleted = False
    if image.published_at is None:
        image.published_at = utcnow()

    _log(
        db,
        image,
        action=ACTION_APPROVE,
        from_status=from_status,
        to_status=AUDIT_APPROVED,
        admin_id=admin.id,
    )
    db.flush()
    counter_service.refresh_for_image(db, image)
    # 与状态变更同事务：不能出现「图已公开但关注者没收到通知」。
    # from_status 守卫：approve() 允许对已下架的图再次 approve（恢复上架路径），
    # 不守卫就会给关注者重复轰炸；restore() 走另一条路径，天然不触发。
    receiver_ids: list[int] = []
    if from_status != AUDIT_APPROVED:
        receiver_ids = notification_service.fanout_image_published(db, image)
    db.commit()

    # 推送在 commit 之后：这是 HTTP 线程，push_to_users 内部跨线程投递到事件循环
    if receiver_ids:
        from app.realtime.manager import push_to_users

        push_to_users(receiver_ids, {"type": "notification", "image_id": image.id})


def reject(db: Session, image: Image, admin: User, reason: str) -> None:
    if image.audit_status != AUDIT_PENDING:
        raise BadRequestError("只能驳回待审核的图片")
    reason = (reason or "").strip()
    if not reason:
        raise BadRequestError("驳回必须填写原因")

    image.audit_status = AUDIT_REJECTED
    image.reject_reason = reason[:255]
    image.audited_by = admin.id
    image.audited_at = utcnow()

    _log(
        db,
        image,
        action=ACTION_REJECT,
        from_status=AUDIT_PENDING,
        to_status=AUDIT_REJECTED,
        admin_id=admin.id,
        reason=image.reject_reason,
    )
    db.commit()


def takedown(db: Session, image: Image, admin: User, reason: str | None = None) -> None:
    if image.is_deleted:
        raise BadRequestError("该图片已下架")

    image.is_deleted = True
    _log(
        db,
        image,
        action=ACTION_TAKEDOWN,
        from_status=image.audit_status,
        to_status=image.audit_status,
        admin_id=admin.id,
        reason=(reason or "").strip()[:255] or None,
    )
    db.flush()
    counter_service.refresh_for_image(db, image)
    db.commit()


def restore(db: Session, image: Image, admin: User) -> None:
    if not image.is_deleted:
        raise BadRequestError("该图片未被下架")
    if image.audit_status != AUDIT_APPROVED:
        raise BadRequestError("只能恢复已通过审核的图片")

    image.is_deleted = False
    _log(
        db,
        image,
        action=ACTION_RESTORE,
        from_status=image.audit_status,
        to_status=image.audit_status,
        admin_id=admin.id,
    )
    db.flush()
    counter_service.refresh_for_image(db, image)
    db.commit()


def resubmit(db: Session, image: Image) -> None:
    """用户改完内容后重新提交审核。"""
    if image.audit_status != AUDIT_REJECTED:
        raise BadRequestError("只有被驳回的图片才能重新提交")

    image.audit_status = AUDIT_PENDING
    image.reject_reason = None
    image.audited_by = None
    image.audited_at = None

    _log(
        db,
        image,
        action=ACTION_RESUBMIT,
        from_status=AUDIT_REJECTED,
        to_status=AUDIT_PENDING,
    )
    db.commit()