"""关注关系表。

follower_id / followee_id 两个外键指向同一张表，刻意不加 relationship()：
SQLAlchemy 需要 foreign_keys= 才能消歧，而这里的查询全是直接拼 select，
加了关系反而多一处要维护的地方。
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, big_fk, big_pk, utcnow


class Follow(Base):
    __tablename__ = "follows"

    id: Mapped[int] = big_pk()
    follower_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    followee_id: Mapped[int] = big_fk("users.id", ondelete="CASCADE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("follower_id", "followee_id", name="uk_follow_pair"),
        # 我关注了谁 / 关注流
        Index("ix_follow_follower", "follower_id", "created_at"),
        # 谁关注了我 / 发布通知的推送名单
        Index("ix_follow_followee", "followee_id", "created_at"),
    )