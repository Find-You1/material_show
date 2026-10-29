"""本地磁盘文件的访问路由。

不用 StaticFiles 挂载，因为需要给图片加长缓存头：
storage_key 里含 uuid，内容永不变，可以安全地用 immutable。
"""

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.errors import NotFoundError
from app.storage.registry import get_storage

router = APIRouter(tags=["media"])

# Windows 的 mimetypes 注册表不认识 webp，FileResponse 会退化成
# application/octet-stream。这里显式指定，保证浏览器按图片处理。
_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
}


@router.get(f"{settings.MEDIA_URL_PREFIX}/{{key:path}}", name="serve_media")
def serve_media(
    key: str,
    download: bool = Query(False, description="置 1 时以附件形式下载"),
    name: str | None = Query(None, description="下载文件名"),
) -> FileResponse:
    local = get_storage("local")
    abs_path = local.abs_path(key)  # 内部做路径穿越校验
    if not abs_path.is_file():
        raise NotFoundError("文件不存在")

    return FileResponse(
        abs_path,
        media_type=_MEDIA_TYPES.get(abs_path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
        # 下载文件名交给 FileResponse 编码：中文名需要 RFC 5987 的 filename* 形式，
        # 自己拼 Content-Disposition 会写出非 ASCII 的非法头。
        filename=(name or abs_path.name) if download else None,
    )