"""后台管理路由。

整个 /api/admin/** 在父路由上就挂 get_current_admin，
所以子模块不必各自校验权限，普通用户请求任何后台接口都会得到 403。
"""

from fastapi import APIRouter, Depends

from app.core.deps import get_current_admin
from app.routers.admin import audit, images, taxonomy, users

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin)],
)

router.include_router(audit.router)
router.include_router(images.router)
router.include_router(users.router)
router.include_router(taxonomy.router)