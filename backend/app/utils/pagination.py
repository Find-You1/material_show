"""分页参数归一化。响应体结构见 app.schemas.common.Page。"""


def page_params(page: int = 1, size: int = 24, *, max_size: int = 60) -> tuple[int, int]:
    page = max(1, page)
    size = min(max(1, size), max_size)
    return page, size