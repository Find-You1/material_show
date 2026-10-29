"""用户与鉴权相关 schema。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

# bcrypt 5.0 对超过 72 字节的密码抛 ValueError（不再静默截断）。
# 中文 UTF-8 是 3 字节/字，所以这里限 24 个字符，留出安全余量。
PASSWORD_MAX_LENGTH = 24


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_\u4e00-\u9fff-]+$")
    email: EmailStr
    password: str = Field(min_length=6, max_length=PASSWORD_MAX_LENGTH)
    nickname: str | None = Field(default=None, max_length=50)


class LoginIn(BaseModel):
    # 支持用户名或邮箱登录
    account: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    nickname: str
    avatar_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _resolve_avatar(cls, data: object) -> object:
        """ORM 对象入口统一把头像换成现算 URL。

        挂在这一层，UserOut / UserPublic / 后台用户列表 / 图片作者信息 / 登录注册响应
        会全部继承，改动面自动收口，不用逐个调用点改。
        必须返回**整行列字典**：子类多出的 email、role 等字段都从它取值，
        只回一个 {avatar_url} 会让子类校验失败。
        """
        if not hasattr(data, "__mapper__"):
            return data

        from app.services.user_service import avatar_url_of

        values = {col.name: getattr(data, col.name) for col in data.__mapper__.columns}
        values["avatar_url"] = avatar_url_of(data)
        return values


class UserOut(UserBrief):
    email: str
    bio: str | None = None
    role: str
    is_active: bool
    upload_count: int
    approved_count: int
    created_at: datetime


class UserPublic(UserBrief):
    """个人主页对外展示的信息，不含邮箱。"""

    bio: str | None = None
    role: str
    upload_count: int
    approved_count: int
    created_at: datetime
    following_count: int = 0
    follower_count: int = 0
    is_following: bool = False


class FollowUserOut(UserBrief):
    """关注 / 粉丝列表里的一行。

    is_following 表示「当前登录者是否关注了这个人」，供列表里的关注按钮用。
    """

    is_following: bool = False


class ProfileUpdateIn(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=50)
    bio: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=500)


class PasswordChangeIn(BaseModel):
    old_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(min_length=6, max_length=PASSWORD_MAX_LENGTH)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AdminUserUpdateIn(BaseModel):
    role: str | None = Field(default=None, pattern=r"^(user|admin)$")
    is_active: bool | None = None