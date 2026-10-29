"""颜色工具。"""

import logging

logger = logging.getLogger(__name__)


def rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def dominant_color(img) -> str | None:
    """缩到 1x1 取像素作为主色调，用作图片加载前的占位背景色。"""
    try:
        from PIL import Image

        small = img.convert("RGB").resize((1, 1), Image.Resampling.BOX)
        r, g, b = small.getpixel((0, 0))
        small.close()
        return rgb_to_hex(r, g, b)
    except Exception:  # noqa: BLE001
        logger.warning("主色提取失败", exc_info=True)
        return None