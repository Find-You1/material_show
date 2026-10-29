"""URL 友好的 slug 生成。中文直接保留（MySQL utf8mb4 + 前端 encodeURIComponent 均可用）。"""

import re

_NON_SLUG = re.compile(r"[^0-9a-zA-Z\u4e00-\u9fff]+")


def slugify(text: str, max_length: int = 64) -> str:
    text = (text or "").strip().lower()
    slug = _NON_SLUG.sub("-", text).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug:
        slug = "item"
    return slug[:max_length].strip("-") or "item"