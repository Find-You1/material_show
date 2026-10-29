"""图片处理流水线：上传后的校验、EXIF 提取、多档尺寸生成、写库。

在独立的 worker 线程里执行，所以第一件事就是自建 SessionLocal——
跨线程复用请求线程的 session 是这类项目绝大多数诡异 bug 的来源。

任务状态通过 images.process_status 持久化（而不是内存队列），
这样进程被杀之后，启动时的补偿扫描能把中断的任务重新捞回来。
"""

import gc
import io
import logging
import posixpath

from PIL import Image as PILImage
from PIL import ImageOps

from app.core.config import settings
from app.db.session import SessionLocal
from app.imaging.exif import extract_exif
from app.imaging.variants import (
    ALLOWED_FORMATS,
    FORMAT_TO_EXT,
    FORMAT_TO_MIME,
    MAX_TARGET_WIDTH,
    PRESETS,
)
from app.models.image import (
    AUDIT_APPROVED,
    PROC_FAILED,
    PROC_PROCESSING,
    PROC_READY,
    SOURCE_OFFICIAL,
    Image,
)
from app.models.variant import SIZE_ORIGINAL, ImageVariant
from app.storage.registry import get_storage
from app.utils.colors import dominant_color

logger = logging.getLogger(__name__)

# 超大图直接拒绝，这是 Pillow 处理大图最直接的内存防线
PILImage.MAX_IMAGE_PIXELS = settings.MAX_IMAGE_PIXELS


def process_image_job(image_id: int) -> None:
    db = SessionLocal()
    try:
        image = db.get(Image, image_id)
        if image is None or image.process_status == PROC_READY:
            return

        image.process_status = PROC_PROCESSING
        image.process_error = None
        db.commit()

        try:
            _run_pipeline(db, image)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.exception("图片处理失败 image_id=%s", image_id)
            failed = db.get(Image, image_id)
            if failed is not None:
                failed.process_status = PROC_FAILED
                failed.process_error = (str(exc) or exc.__class__.__name__)[:255]
                db.commit()
    finally:
        db.close()


def _run_pipeline(db, image: Image) -> None:
    storage = get_storage(image.storage_backend)
    key = image.storage_key
    base_dir = posixpath.dirname(key)

    fp = _acquire(storage, key)
    try:
        _verify_image(fp)

        fp.seek(0)
        img = PILImage.open(fp)
        try:
            # 必须在 exif_transpose 之前取出 format：
            # exif_transpose 返回的是新对象，Pillow 不会把原图的 format 带过去（会是 None）。
            src_format = img.format
            if src_format not in ALLOWED_FORMATS:
                raise ValueError(f"不支持的图片格式：{src_format}")

            if src_format == "JPEG":
                # 触发 DCT 缩放解码，大图解码速度提升数倍、内存成倍下降
                img.draft("RGB", (MAX_TARGET_WIDTH, MAX_TARGET_WIDTH))

            # 不做方向修正的话，手机竖拍图的宽高会与实际不符，直接毁掉瀑布流布局
            img = ImageOps.exif_transpose(img) or img
            if img.mode not in ("RGB", "RGBA", "L", "LA"):
                img = img.convert("RGB")

            src_w, src_h = img.size
            if src_w <= 0 or src_h <= 0:
                raise ValueError("图片尺寸异常")

            exif_data = extract_exif(img)
            color = dominant_color(img)

            # 提前归一化，_build_variants 里 original 档位要用到 image.format
            image.format = FORMAT_TO_EXT.get(src_format, "jpg")
            image.mime_type = FORMAT_TO_MIME.get(src_format, "image/jpeg")

            variants = _build_variants(storage, image, img, base_dir, src_w, src_h)

            _replace_variants(db, image, variants)

            image.width = src_w
            image.height = src_h
            image.exif = exif_data
            image.dominant_color = color
            image.process_status = PROC_READY
            image.process_error = None

            becomes_public = False
            if image.source == SOURCE_OFFICIAL and image.audit_status != AUDIT_APPROVED:
                from app.db.base import utcnow

                image.audit_status = AUDIT_APPROVED
                image.published_at = utcnow()
                becomes_public = True

            db.commit()

            if becomes_public:
                from app.services import counter_service, notification_service

                # 与 approve() 同一个 fan-out 出口。注意这里跑在图片处理线程池里，
                # 不在 HTTP 线程，最容易漏的一处 —— push_to_users 是线程安全的。
                counter_service.refresh_for_image(db, image)
                receiver_ids = notification_service.fanout_image_published(db, image)
                db.commit()

                if receiver_ids:
                    from app.realtime.manager import push_to_users

                    push_to_users(
                        receiver_ids, {"type": "notification", "image_id": image.id}
                    )
        finally:
            img.close()
    finally:
        fp.close()


def _acquire(storage, key: str):
    """拿到一个可定位（seekable）的文件对象。

    本地磁盘直接返回真实文件对象，PIL 可以用它工作，不额外占内存；
    S3 的流不可定位，只能读进内存。
    """
    fh = storage.open(key)
    if storage.name == "local":
        return fh
    try:
        return io.BytesIO(fh.read())
    finally:
        fh.close()


def _verify_image(fp) -> None:
    """校验文件确实是合法图片。

    注意 Pillow 的 verify() 会让文件对象失效，调用方必须先 seek(0) 再重新打开。
    """
    try:
        PILImage.open(fp).verify()
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"文件不是有效的图片：{exc}") from exc


def _build_variants(
    storage, image: Image, img, base_dir: str, src_w: int, src_h: int
) -> list[ImageVariant]:
    """生成各档缩略图并落盘，返回待写入的 variant 列表（含 original）。"""
    variants: list[ImageVariant] = [
        ImageVariant(
            image_id=image.id,
            size_code=SIZE_ORIGINAL,
            width=src_w,
            height=src_h,
            file_size=image.file_size,
            format=image.format,
            storage_key=image.storage_key,
        )
    ]

    for preset in PRESETS:
        target_w = min(preset.max_width, src_w)
        target_h = max(1, round(src_h * target_w / src_w))

        if (target_w, target_h) == (src_w, src_h):
            out = img.copy()
        else:
            out = img.resize((target_w, target_h), PILImage.Resampling.LANCZOS)

        try:
            buf = io.BytesIO()
            out.save(buf, format=preset.fmt, quality=preset.quality, method=4)
            data = buf.getvalue()
            variant_key = f"{base_dir}/{preset.size_code}.{preset.ext}"
            storage.save(variant_key, data, "image/webp")

            variants.append(
                ImageVariant(
                    image_id=image.id,
                    size_code=preset.size_code,
                    width=target_w,
                    height=target_h,
                    file_size=len(data),
                    format=preset.ext,
                    storage_key=variant_key,
                )
            )
        finally:
            # 三档顺序处理，每档立刻释放，避免峰值内存叠加
            out.close()
            gc.collect()

    return variants


def _replace_variants(db, image: Image, variants: list[ImageVariant]) -> None:
    """重跑流水线时先清掉旧档位记录，再整体替换。

    中间的 flush 必须有：保证 DELETE 先于 INSERT 落到数据库，
    否则会撞 (image_id, size_code) 的唯一约束。
    """
    image.variants = []
    db.flush()
    image.variants = variants