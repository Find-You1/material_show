"""WebSocket 连接管理。

原则：**WS 只做实时性增强，消息/通知先落库，推送失败绝不影响业务成功。**
这也是「断了就降级轮询」这套方案能成立的前提。

连接表在进程内存里，所以必须单进程运行（`--workers > 1` 推送必丢，
与 core/ratelimit.py 的内存滑动窗口是同一个假设）。
多进程方案将来只需把 push_to_users 换成 Redis pub/sub 实现，调用方零改动。
"""

import asyncio
import logging
import threading
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """一个用户可以有 N 个标签页，全部保留在集合里。"""

    def __init__(self) -> None:
        # dict[int, set[WebSocket]]：_lock 保护跨线程访问（HTTP 线程 / 处理线程池）
        self._conns: dict[int, set[WebSocket]] = {}
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """只在 main.py 的 lifespan 里调用 —— 那是唯一可靠的抓事件循环时机。

        不要用 asyncio.get_event_loop()（3.10+ 在非循环线程会警告/报错），
        也不要在模块顶层抓。
        """
        self._loop = loop

    def register(self, user_id: int, ws: WebSocket) -> None:
        with self._lock:
            self._conns.setdefault(user_id, set()).add(ws)

    def unregister(self, user_id: int, ws: WebSocket) -> None:
        with self._lock:
            conns = self._conns.get(user_id)
            if not conns:
                return
            conns.discard(ws)
            # 集合空了必须删键：否则长期运行会累积一堆空 user_id 键
            if not conns:
                self._conns.pop(user_id, None)

    def snapshot(self, user_ids: Iterable[int]) -> list[tuple[int, WebSocket]]:
        with self._lock:
            return [
                (uid, ws) for uid in set(user_ids) for ws in self._conns.get(uid, ())
            ]

    async def _send_many(self, targets: list[tuple[int, WebSocket]], payload: Any) -> None:
        """只在事件循环线程里执行。

        发送失败的连接立刻摘除 —— 不给死连接反复重试的机会。
        """
        for user_id, ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001
                self.unregister(user_id, ws)

    def push_to_users(self, user_ids: Iterable[int], payload: Any) -> None:
        """同步函数：任意 HTTP 线程 / 图片处理线程池都可以调用。**永不抛异常**。"""
        loop = self._loop
        if loop is None or loop.is_closed():
            return  # 启动早期或关停中：静默降级
        targets = self.snapshot(user_ids)
        if not targets:
            return
        try:
            fut = asyncio.run_coroutine_threadsafe(self._send_many(targets, payload), loop)
        except RuntimeError:
            return  # loop 已关闭
        # 只挂回调记日志，绝不 .result() —— 否则会阻塞业务线程
        fut.add_done_callback(_log_future_error)


def _log_future_error(fut: "asyncio.Future") -> None:
    try:
        fut.result()
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS 推送失败：%s", exc)


manager = ConnectionManager()


def push_to_users(user_ids: Iterable[int], payload: Any) -> None:
    """模块级快捷入口，业务代码只依赖它。"""
    manager.push_to_users(user_ids, payload)