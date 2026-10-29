"""极简内存限流。

只用来挡「注册轰炸」和「上传刷接口」这类明显滥用，不追求精确。

为什么是内存而不是 Redis：Windows 上 uvicorn 刻意不开 --workers（见 deploy.ps1 的说明），
进程只有一个，进程内计数就够。将来要多进程/多机时，把 _buckets 换成 Redis 计数器即可，
调用方（rate_limit 依赖）不用改。
"""

import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError

# key -> 该 key 最近的请求时间戳（单调时钟）
_buckets: dict[str, deque[float]] = defaultdict(deque)

# 兜底：被大量不同 IP 刷时不让字典无限涨
_MAX_BUCKETS = 20_000


def _client_ip(request: Request) -> str:
    # 挂在反代后面时真实 IP 在 X-Forwarded-For 的第一段
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(scope: str, limit: int, window_seconds: int):
    """生成一个 FastAPI 依赖：同一 IP 在 window_seconds 内最多 limit 次。

    用法：@router.post("/xxx", dependencies=[Depends(rate_limit("xxx", 5, 600))])
    """

    def _dependency(request: Request) -> None:
        if len(_buckets) > _MAX_BUCKETS:
            _buckets.clear()

        key = f"{scope}:{_client_ip(request)}"
        now = time.monotonic()
        bucket = _buckets[key]

        # 滑出窗口的历史记录丢掉
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = int(window_seconds - (now - bucket[0])) + 1
            raise AppError(
                429,
                "TOO_MANY_REQUESTS",
                f"操作过于频繁，请 {retry_after} 秒后再试",
            )

        bucket.append(now)

    return _dependency