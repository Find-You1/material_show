"""种子数据：初始分类 + 管理员账号。

可重复执行（幂等）：已存在的分类/用户不会被覆盖。
默认管理员密码是开发用弱口令，仅当 SEED_ADMIN_PASSWORD 未设置时使用，
生产环境必须在 .env 里显式指定。

用法：
    python -m app.db.seed
"""

import logging
import os

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.category import Category
from app.models.user import ROLE_ADMIN, User

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_USERNAME = os.getenv("SEED_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@material-show.local")
DEFAULT_ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "Admin@123456")

# (分类名, slug, 说明, 排序)
CATEGORIES: list[tuple[str, str, str, int]] = [
    ("自然风景", "nature", "山川湖海、森林草原与四季风光", 10),
    ("城市建筑", "city", "都市天际线、街景与建筑结构", 20),
    ("人物人像", "people", "人物肖像与日常生活瞬间", 30),
    ("动物", "animals", "野生动物与宠物摄影", 40),
    ("美食", "food", "菜品、食材与餐桌氛围", 50),
    ("商务办公", "business", "办公场景、会议与团队协作", 60),
    ("科技数码", "technology", "设备、代码与未来感视觉", 70),
    ("旅行", "travel", "旅途见闻与异域人文", 80),
    ("抽象背景", "abstract", "纹理、渐变与可商用背景图", 90),
    ("运动健身", "sports", "竞技运动与户外锻炼", 100),
    ("花卉植物", "flowers", "花卉特写与植物细节", 110),
    ("交通运输", "transport", "交通工具与道路场景", 120),
]


def seed_categories() -> int:
    created = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Category.slug)))
        for name, slug, description, sort_order in CATEGORIES:
            if slug in existing:
                continue
            db.add(
                Category(
                    name=name,
                    slug=slug,
                    description=description,
                    sort_order=sort_order,
                )
            )
            created += 1
        db.commit()
    return created


def seed_admin() -> int:
    created = 0
    with SessionLocal() as db:
        exists = db.scalar(
            select(User.id).where(
                func.lower(User.username) == DEFAULT_ADMIN_USERNAME.lower()
            )
        )
        if exists:
            return 0
        db.add(
            User(
                username=DEFAULT_ADMIN_USERNAME,
                email=DEFAULT_ADMIN_EMAIL,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                nickname="管理员",
                role=ROLE_ADMIN,
                is_active=True,
            )
        )
        db.commit()
        created = 1
    return created


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    cats = seed_categories()
    admins = seed_admin()

    logger.info("新增分类 %d 个，新增管理员 %d 个", cats, admins)
    if admins:
        logger.info("管理员账号：%s / %s", DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD)
        if not os.getenv("SEED_ADMIN_PASSWORD"):
            logger.warning("正在使用默认管理员密码，请尽快修改或设置 SEED_ADMIN_PASSWORD")


if __name__ == "__main__":
    main()