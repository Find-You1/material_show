"""集中导入所有模型，Alembic autogenerate 依赖这里把它们注册进 metadata。"""

from app.models.audit import AuditLog
from app.models.block import UserBlock
from app.models.category import Category
from app.models.conversation import Conversation
from app.models.download import Download
from app.models.favorite import Favorite
from app.models.follow import Follow
from app.models.image import (
    AUDIT_APPROVED,
    AUDIT_PENDING,
    AUDIT_REJECTED,
    PROC_FAILED,
    PROC_PROCESSING,
    PROC_QUEUED,
    PROC_READY,
    PUBLIC_FILTER,
    SOURCE_COMMUNITY,
    SOURCE_OFFICIAL,
    Image,
)
from app.models.message import Message
from app.models.notification import (
    NOTIF_FOLLOW,
    NOTIF_IMAGE_PUBLISHED,
    NOTIF_SYSTEM,
    Notification,
)
from app.models.tag import Tag, image_tags
from app.models.user import ROLE_ADMIN, ROLE_USER, User
from app.models.variant import (
    SIZE_MEDIUM,
    SIZE_ORIGINAL,
    SIZE_PREVIEW,
    SIZE_THUMB,
    ImageVariant,
)

__all__ = [
    "AUDIT_APPROVED",
    "AUDIT_PENDING",
    "AUDIT_REJECTED",
    "PROC_FAILED",
    "PROC_PROCESSING",
    "PROC_QUEUED",
    "PROC_READY",
    "PUBLIC_FILTER",
    "ROLE_ADMIN",
    "ROLE_USER",
    "SIZE_MEDIUM",
    "SIZE_ORIGINAL",
    "SIZE_PREVIEW",
    "SIZE_THUMB",
    "SOURCE_COMMUNITY",
    "SOURCE_OFFICIAL",
    "AuditLog",
    "Category",
    "Conversation",
    "Download",
    "Favorite",
    "Follow",
    "Image",
    "ImageVariant",
    "Message",
    "NOTIF_FOLLOW",
    "NOTIF_IMAGE_PUBLISHED",
    "NOTIF_SYSTEM",
    "Notification",
    "Tag",
    "User",
    "UserBlock",
    "image_tags",
]