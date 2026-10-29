"""WebSocket 握手与心跳。

浏览器 WebSocket 不能带自定义 header，所以 token 走 query
（/api/ws?token=...）。本地部署可接受；要更强可改用 Sec-WebSocket-Protocol 子协议。
**不要改成 cookie**：与 Bearer 体系冲突，且 CORS 里 allow_credentials=False。

握手时复用 deps._resolve_user 的语义（含 is_active 检查，补偿 7 天 token 无吊销机制）。
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User
from app.realtime.manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])


def _lookup_user(token: str) -> int | None:
    """同步校验 token。跑在线程池里，不阻塞事件循环。"""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (UnauthorizedError, KeyError, TypeError, ValueError):
        return None

    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            return None
        return user.id


def _unread_of(user_id: int) -> dict:
    """未读汇总，连接建立时先推一次，省得前端再打一次 REST。"""
    from app.services import message_service, notification_service

    with SessionLocal() as db:
        notes = notification_service.count_unread(db, user_id)
        messages = message_service.count_unread(db, user_id)
    return {"notifications": notes, "messages": messages, "total": notes + messages}


@router.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token") or ""
    user_id = await run_in_threadpool(_lookup_user, token)
    if user_id is None:
        # WS 不走 HTTP 异常处理器，只能直接关连接；4401 让前端识别「凭证无效」
        await websocket.close(code=4401)
        return

    await websocket.accept()
    manager.register(user_id, websocket)
    try:
        await websocket.send_json(
            {"type": "hello", "unread": await run_in_threadpool(_unread_of, user_id)}
        )
        while True:
            data = await websocket.receive_json()
            # 只认心跳：所有写操作走 REST，WS 只推不收
            if isinstance(data, dict) and data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        # 非法 payload、连接被强制中断等都从这里出去，记 debug 即可
        logger.debug("WS 异常断开 user_id=%s", user_id)
    finally:
        manager.unregister(user_id, websocket)