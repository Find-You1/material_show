"""进程内任务执行器。

为什么不用 BackgroundTasks：它在响应之后占用同一个线程池槽位执行长任务，
会拖慢后续请求；服务重启任务直接丢失且无任何记录。

为什么不用 Celery：需要 Redis/RabbitMQ broker，对单机项目是纯负担。

方案：线程池 + 用 images.process_status 持久化记账 + 启动时补偿扫描，
在没有消息队列的前提下实现「至少一次」执行。
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from sqlalchemy import select, update

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.image import PROC_PROCESSING, PROC_QUEUED, Image

logger = logging.getLogger(__name__)


class TaskRunner:
    def __init__(self, max_workers: int = 2) -> None:
        # 图片处理是 CPU + 内存密集型，worker 数必须压住，否则大图会撑爆内存。
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="imgjob")

    def submit(self, fn: Callable, *args) -> None:
        self._pool.submit(self._safe, fn, *args)

    @staticmethod
    def _safe(fn: Callable, *args) -> None:
        try:
            fn(*args)
        except Exception:  # noqa: BLE001
            logger.exception("后台任务执行失败：%s", getattr(fn, "__name__", fn))

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)


runner = TaskRunner(settings.IMAGE_WORKERS)


def submit_image_job(image_id: int) -> None:
    """把一张图片的处理任务丢进线程池。

    延迟导入 app.imaging.pipeline：pipeline 会反向导入模型与存储层，
    放在模块顶层容易形成循环导入。
    """
    from app.imaging.pipeline import process_image_job

    runner.submit(process_image_job, image_id)


def recover_pending_jobs() -> None:
    """启动时把中断的任务救回来。

    先复位 processing（这些是上个进程被杀时残留的），再把所有 queued 重新投递。
    """
    try:
        with SessionLocal() as db:
            db.execute(
                update(Image)
                .where(Image.process_status == PROC_PROCESSING)
                .values(process_status=PROC_QUEUED, process_error="服务重启，已重新排队")
            )
            db.commit()
            pending_ids = list(
                db.scalars(select(Image.id).where(Image.process_status == PROC_QUEUED))
            )
    except Exception:  # noqa: BLE001
        logger.exception("启动补偿扫描失败")
        return

    if pending_ids:
        logger.info("重新投递 %d 个未完成的图片处理任务", len(pending_ids))
    for image_id in pending_ids:
        submit_image_job(image_id)