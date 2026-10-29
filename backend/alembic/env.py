"""Alembic 环境配置。

关键点：include_object 把 ft_images_search 排除在 autogenerate 之外。
该索引带 WITH PARSER ngram，autogenerate 会丢掉 parser 子句导致中文搜不到，
所以它由迁移文件里的 op.execute 手写创建，这里必须屏蔽以免被反复增删。
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401  确保所有模型都注册进 metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# 由手写迁移维护、不参与 autogenerate 对比的对象
_MANUAL_INDEXES = {"ft_images_search"}


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    if type_ == "index" and name in _MANUAL_INDEXES:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()