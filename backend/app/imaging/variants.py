"""图片尺寸预设。

档位是「数据」而不是 schema，后续加档只需往这里追加一条。
只降不升：目标宽度取 min(预设宽度, 原图宽度)。
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class VariantPreset:
    size_code: str
    max_width: int
    fmt: str = "WEBP"
    quality: int = 82
    ext: str = "webp"


PRESETS: tuple[VariantPreset, ...] = (
    VariantPreset("thumb", 400, quality=78),
    VariantPreset("preview", 960, quality=82),
    VariantPreset("medium", 1600, quality=84),
)

PRESET_BY_CODE = {p.size_code: p for p in PRESETS}

# 缩略图处理时的最大目标宽度，用于触发 JPEG 的 DCT 缩放解码
MAX_TARGET_WIDTH = max(p.max_width for p in PRESETS)

# 允许上传的格式（Pillow 的 format 名称）
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}

FORMAT_TO_EXT = {
    "JPEG": "jpg",
    "PNG": "png",
    "WEBP": "webp",
}