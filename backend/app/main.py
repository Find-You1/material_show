"""应用入口。

注意：所有业务路由一律用 def 而非 async def。
本项目是同步 SQLAlchemy + PyMySQL，async def 里执行同步 db.execute 会阻塞事件循环，
比全同步方案慢一个数量级。def 路由会被 Starlette 自动丢进线程池执行。
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import BASE_DIR, settings
from app.core.errors import NotFoundError, register_exception_handlers
from app.core.logging import setup_logging
from app.routers import (
    auth,
    categories,
    health,
    images,
    me,
    media,
    messages,
    notifications,
    search,
    tags,
    users,
    ws,
)
from app.routers import admin as admin_router

# 前端构建产物目录（backend/ 的同级）
FRONTEND_DIST = (BASE_DIR.parent / "frontend" / "dist").resolve()

# 这些前缀属于后端自己，不能回退成前端页面，否则 /api/typo 会返回一坨 HTML
_RESERVED_PREFIXES = ("api", "media", "docs", "redoc", "openapi.json")


def mount_frontend(app: FastAPI) -> None:
    """托管前端构建产物，并让前端路由回退到 index.html。

    开发期 dist 不存在就整个跳过，继续走 Vite dev server + proxy，两套静态资源不打架。
    """
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        return

    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith(_RESERVED_PREFIXES):
            raise NotFoundError("接口不存在")

        # 根目录下的静态文件（favicon 等）直接给出去；其余交给前端路由
        if full_path:
            candidate = (FRONTEND_DIST / full_path).resolve()
            # 防目录穿越：只允许读 dist 以内的文件
            if candidate.is_file() and FRONTEND_DIST in candidate.parents:
                return FileResponse(candidate)

        return FileResponse(index)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.DEBUG)
    # 抓事件循环的唯一可靠时机：WS 推送要从 HTTP 线程 / 处理线程池跨线程投递，
    # 必须先知道往哪个 loop 上投（见 realtime/manager.py）。
    import asyncio

    from app.realtime.manager import manager

    manager.bind_loop(asyncio.get_running_loop())

    # 启动补偿扫描：把上次进程被中断时卡在 processing 的任务重新排队
    from app.tasks.runner import recover_pending_jobs, runner

    recover_pending_jobs()
    yield
    runner.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    # 用 Bearer header 而非 Cookie，所以 allow_credentials 必须为 False
    # （True 与 allow_origins=["*"] 互斥，且没有实际收益）。
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(media.router)

    # 鉴权与用户中心
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(users.router)
    app.include_router(notifications.router)
    app.include_router(messages.router)
    # WS 路由必须在 mount_frontend 之前注册：它虽是 /api 前缀不会被 catch-all 吃掉，
    # 但保持「业务路由先于前端托管」这条顺序，语义更清楚
    app.include_router(ws.router)

    # 浏览端
    app.include_router(images.router)
    app.include_router(search.router)
    app.include_router(categories.router)
    app.include_router(tags.router)

    # 后台（父路由已统一挂管理员依赖）
    app.include_router(admin_router.router)

    # 必须最后挂：SPA 回退是个 catch-all，注册早了会把上面的接口全吃掉
    mount_frontend(app)

    return app


app = create_app()