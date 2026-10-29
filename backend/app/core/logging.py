"""日志配置：统一格式，uvicorn 与业务日志都走 stdout。"""

import logging
import sys


def setup_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # SQLAlchemy 的 INFO 日志太吵，只在需要时开
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)