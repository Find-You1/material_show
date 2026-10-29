"""当前用户中心：资料、上传、收藏。

上传接口本身只做三件事：校验元信息 → 原图落盘 → 建记录并入队，
真正的图片处理交给后台线程池，接口立刻返回，前端轮询处理进度。
"""

import io
import logging
import os
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from PIL import Image as PILImage
from PIL import ImageOps
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.models.favorite import Favorite
from app.models.image import (
    AUDIT_APPROVED,
    AUDIT_PENDING,
    AUDIT_REJECTED,
    PROC_QUEUED,
    PROC_READY,
    SOURCE_COMMUNITY,
    SOURCE_OFFICIAL,
    Image,
)
from app.models.user import User
from app.models.variant import ImageVariant
from app.schemas.common import MessageOut, Page
from app.schemas.image import (
    ImageOut,
    ImageUpdateIn,
    MyUploadOut,
    ProcessStatusOut,
    UploadResultOut,
)
from app.schemas.message import BlockedUserOut
from app.schemas.user import PasswordChangeIn, ProfileUpdateIn, UserOut
from app.services import (
    audit_service,
    auth_service,
    image_service,
    message_service,
    notification_service,
)
from app.storage.registry import get_storage
from app.tasks.runner import submit_image_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/me", tags=["me"])

_ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# 头像单独限 2MB：它只用来做 512px 方图，不走 MAX_UPLOAD_MB 那条大图线
AVATAR_MAX_BYTES = 2 * 1024 * 1024
AVATAR_SIZE = 512


# ---------------------------------------------------------------- 资料


@router.get("", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=UserOut)
def update_me(
    payload: ProfileUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    return user


@router.post("/password", response_model=MessageOut)
def change_password(
    payload: PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    auth_service.change_password(db, user, payload.old_password, payload.new_password)
    return MessageOut(message="密码已更新")


def _drop_avatar_file(backend: str | None, key: str | None) -> None:
    """删旧头像文件。用它自己记录的 backend，切换存储后端后也能清干净。

    删除失败只记日志：新头像已经写好了，不该因为清旧文件失败而报错回滚。
    """
    if not key:
        return
    try:
        get_storage(backend).delete(key)
    except Exception:  # noqa: BLE001
        logger.warning("旧头像清理失败 backend=%s key=%s", backend, key)


@router.post(
    "/avatar",
    response_model=UserOut,
    dependencies=[Depends(rate_limit("avatar", 10, 600))],
)
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise BadRequestError("只支持 JPG、PNG、WEBP 格式的图片", code="UNSUPPORTED_TYPE")

    stream = file.file
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    if size <= 0:
        raise BadRequestError("文件为空", code="EMPTY_FILE")
    if size > AVATAR_MAX_BYTES:
        raise BadRequestError("头像不能超过 2MB", code="FILE_TOO_LARGE")

    try:
        img = PILImage.open(stream)
        img.load()
    except Exception:  # noqa: BLE001
        raise BadRequestError("无法解析该图片", code="INVALID_IMAGE") from None

    # 居中裁成方图再缩到 512，统一转 WEBP：尺寸与格式一次定死，前端不必再判断
    squared = ImageOps.fit(img.convert("RGB"), (AVATAR_SIZE, AVATAR_SIZE), PILImage.LANCZOS)
    buf = io.BytesIO()
    squared.save(buf, format="WEBP", quality=88)

    # key 必须带 uuid：/media/** 是 immutable 缓存，key 不变浏览器永远拿旧头像
    key = f"avatars/{user.id}/{uuid4().hex}.webp"
    storage = get_storage()
    storage.save(key, buf.getvalue(), "image/webp")

    old_backend, old_key = user.avatar_backend, user.avatar_key
    user.avatar_backend = storage.name
    user.avatar_key = key
    db.commit()

    _drop_avatar_file(old_backend, old_key)
    db.refresh(user)
    return user


@router.delete("/avatar", response_model=MessageOut)
def delete_avatar(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    old_backend, old_key = user.avatar_backend, user.avatar_key
    user.avatar_backend = None
    user.avatar_key = None
    db.commit()

    _drop_avatar_file(old_backend, old_key)
    return MessageOut(message="头像已移除")


@router.get("/unread")
def get_unread(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """未读数汇总。

    导航栏红点只打这一个接口，避免每 30 秒发两个请求。
    """
    notes = notification_service.count_unread(db, user.id)
    messages = message_service.count_unread(db, user.id)
    return {"notifications": notes, "messages": messages, "total": notes + messages}


@router.get("/blocks", response_model=Page[BlockedUserOut])
def list_my_blocks(
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[BlockedUserOut]:
    """我屏蔽了谁。"""
    from app.utils.pagination import page_params

    page, size = page_params(page, size)
    rows, total = message_service.list_blocks(db, user.id, (page - 1) * size, size)
    return Page(
        items=[
            BlockedUserOut.model_validate(u).model_copy(update={"blocked_at": blocked_at})
            for u, blocked_at in rows
        ],
        total=total,
        page=page,
        size=size,
    )


@router.get("/stats")
def get_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    base = select(func.count()).select_from(Image).where(
        Image.owner_id == user.id, Image.is_deleted.is_(False)
    )
    return {
        "upload_count": db.scalar(base) or 0,
        "approved_count": db.scalar(base.where(Image.audit_status == AUDIT_APPROVED))
        or 0,
        "pending_count": db.scalar(base.where(Image.audit_status == AUDIT_PENDING)) or 0,
        "rejected_count": db.scalar(base.where(Image.audit_status == AUDIT_REJECTED)) or 0,
        "favorites_count": db.scalar(
            select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id)
        )
        or 0,
        "downloads_total": int(
            db.scalar(
                select(func.coalesce(func.sum(Image.downloads_count), 0)).where(
                    Image.owner_id == user.id
                )
            )
            or 0
        ),
    }


# ---------------------------------------------------------------- 上传


# 限流挡刷上传：同一 IP 10 分钟内最多 30 次（图片处理是重的，这条线要低）
@router.post(
    "/uploads",
    response_model=UploadResultOut,
    status_code=201,
    dependencies=[Depends(rate_limit("upload", 30, 600))],
)
def create_upload(
    file: UploadFile = File(...),
    title: str = Form("", max_length=200),
    description: str = Form(""),
    category_id: int | None = Form(None),
    tags: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResultOut:
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise BadRequestError("只支持 JPG、PNG、WEBP 格式的图片", code="UNSUPPORTED_TYPE")

    stream = file.file
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    if size <= 0:
        raise BadRequestError("文件为空", code="EMPTY_FILE")
    if size > settings.max_upload_bytes:
        raise BadRequestError(
            f"图片不能超过 {settings.MAX_UPLOAD_MB}MB", code="FILE_TOO_LARGE"
        )

    ext = _ALLOWED_CONTENT_TYPES[content_type]
    now = datetime.now()
    base_dir = f"{now:%Y/%m/%d}/{uuid4().hex}"
    key = f"{base_dir}/original.{ext}"

    storage = get_storage()
    storage.save_stream(key, stream, content_type)

    clean_title = (title or "").strip() or (file.filename or "未命名").rsplit(".", 1)[0]

    image = Image(
        owner_id=user.id,
        title=clean_title[:200],
        description=(description or "").strip() or None,
        category_id=category_id,
        source=SOURCE_OFFICIAL if user.is_admin else SOURCE_COMMUNITY,
        audit_status=AUDIT_PENDING,
        process_status=PROC_QUEUED,
        storage_backend=storage.name,
        storage_key=key,
        file_size=size,
        mime_type=content_type,
        format=ext,
    )
    image.tags = image_service.collect_tags(db, _split_tags(tags))
    image.tag_text = " ".join(sorted(t.name for t in image.tags))

    db.add(image)
    db.commit()

    # 入队后立刻返回，前端轮询 GET /api/me/uploads/{id}
    submit_image_job(image.id)

    return UploadResultOut(
        id=image.id,
        process_status=image.process_status,
        audit_status=image.audit_status,
        message="上传成功，正在生成预览图",
    )


def _split_tags(raw: str) -> list[str]:
    if not raw:
        return []
    for sep in (",", "，", "、", ";", "；"):
        raw = raw.replace(sep, " ")
    return [t.strip() for t in raw.split() if t.strip()][:10]


@router.get("/uploads", response_model=Page[MyUploadOut])
def list_my_uploads(
    status: str | None = Query(None, pattern="^(pending|approved|rejected)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[MyUploadOut]:
    from app.utils.pagination import page_params

    page, size = page_params(page, size, max_size=100)

    # 自己删掉的图不该再出现在列表里（统计那边也是这么算的）
    conds = [Image.owner_id == user.id, Image.is_deleted.is_(False)]
    if status:
        conds.append(Image.audit_status == status)

    total = db.scalar(select(func.count()).select_from(Image).where(*conds)) or 0
    rows = (
        db.scalars(
            # 用不过滤可见性的起点：待审核/已驳回/处理失败的图作者也要看到
            # （is_deleted 在 conds 里单独排除，见上）
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
        items=[image_service.to_my_upload(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/uploads/{image_id}", response_model=ProcessStatusOut)
def get_upload_status(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProcessStatusOut:
    image = _own_image(db, image_id, user)
    ready = db.scalar(
        select(func.count()).select_from(ImageVariant).where(ImageVariant.image_id == image.id)
    )
    return ProcessStatusOut(
        id=image.id,
        process_status=image.process_status,
        process_error=image.process_error,
        width=image.width,
        height=image.height,
        variants_ready=ready or 0,
    )


@router.patch("/uploads/{image_id}", response_model=MyUploadOut)
def update_upload(
    image_id: int,
    payload: ImageUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyUploadOut:
    image = _own_image(db, image_id, user)
    if not user.is_admin and image.audit_status == AUDIT_APPROVED:
        raise ForbiddenError("已通过审核的图片不能直接修改")

    data = payload.model_dump(exclude_unset=True)
    if "tags" in data and data["tags"] is not None:
        image.tags = image_service.collect_tags(db, data.pop("tags"))
        image.tag_text = " ".join(sorted(t.name for t in image.tags))
    data.pop("tags", None)
    for field, value in data.items():
        setattr(image, field, value)

    db.commit()
    return image_service.to_my_upload(image)


@router.post("/uploads/{image_id}/resubmit", response_model=MyUploadOut)
def resubmit_upload(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyUploadOut:
    image = _own_image(db, image_id, user)
    audit_service.resubmit(db, image)
    return image_service.to_my_upload(image)


@router.post("/uploads/{image_id}/reprocess", response_model=UploadResultOut)
def reprocess_upload(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResultOut:
    image = _own_image(db, image_id, user)
    if image.process_status == PROC_READY:
        raise BadRequestError("该图片已处理完成，无需重新处理")

    db.execute(
        update(Image)
        .where(Image.id == image.id)
        .values(process_status=PROC_QUEUED, process_error=None)
    )
    db.commit()
    db.refresh(image)
    submit_image_job(image.id)
    return UploadResultOut(
        id=image.id,
        process_status=image.process_status,
        audit_status=image.audit_status,
        message="已重新排队处理",
    )


@router.delete("/uploads/{image_id}", response_model=MessageOut)
def delete_upload(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageOut:
    image = _own_image(db, image_id, user)
    # 软删除，保留审计日志与外链的降级页面
    image.is_deleted = True
    db.flush()
    from app.services import counter_service

    counter_service.refresh_for_image(db, image)
    db.commit()
    return MessageOut(message="已删除")


def _own_image(db: Session, image_id: int, user: User) -> Image:
    image = db.get(Image, image_id)
    if image is None:
        raise NotFoundError("图片不存在")
    if image.owner_id != user.id and not user.is_admin:
        raise ForbiddenError("只能操作自己上传的图片")
    return image


# ---------------------------------------------------------------- 收藏


@router.get("/favorites", response_model=Page[ImageOut])
def list_favorites(
    page: int = Query(1, ge=1),
    size: int = Query(24, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[ImageOut]:
    from app.utils.pagination import page_params

    page, size = page_params(page, size)

    join_cond = Favorite.image_id == Image.id
    total = (
        db.scalar(
            select(func.count())
            .select_from(Favorite)
            .join(Image, join_cond)
            .where(Favorite.user_id == user.id)
        )
        or 0
    )
    rows = (
        db.scalars(
            image_service.public_query()
            .join(Favorite, join_cond)
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc())
            .limit(size)
            .offset((page - 1) * size)
        )
        .unique()
        .all()
    )
    return Page(
        items=[image_service.to_image_out(r, is_favorited=True) for r in rows],
        total=total,
        page=page,
        size=size,
    )