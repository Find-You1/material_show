"""数据库引擎与会话。

关键配置说明：
- pool_pre_ping=True  ：MySQL 默认 8 小时空闲断连，不设会偶发 "MySQL server has gone away"。
- pool_recycle=280   ：比 MySQL 的 wait_timeout 早一点回收连接。
- expire_on_commit=False：commit 后仍可安全序列化 ORM 对象，避免额外 N+1 查询。
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_pre_ping=True,
    pool_recycle=280,
    pool_size=10,
    max_overflow=20,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Iterator[Session]:
    """FastAPI 依赖：每个请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()