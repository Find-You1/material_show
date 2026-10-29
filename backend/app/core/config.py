"""全局配置：从 backend/.env 读取，全部集中在这里。"""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ 目录
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- 应用 ----
    APP_NAME: str = "MaterialShow"
    DEBUG: bool = True
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173"

    # ---- 数据库 ----
    DATABASE_URL: str = ""
    DB_ECHO: bool = False

    # ---- 存储 ----
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_ROOT: str = "./storage"
    MEDIA_URL_PREFIX: str = "/media"

    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "material-show"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_PUBLIC_BASE_URL: str = ""
    S3_PRESIGN_EXPIRE: int = 3600

    # ---- 图片处理 ----
    MAX_UPLOAD_MB: int = 20
    IMAGE_WORKERS: int = 2
    MAX_IMAGE_PIXELS: int = 80_000_000

    @model_validator(mode="after")
    def _check_required(self) -> "Settings":
        if not self.SECRET_KEY:
            raise RuntimeError(
                "SECRET_KEY 未配置。请在 backend/.env 中设置，"
                '生成方式：python -c "import secrets;print(secrets.token_urlsafe(48))"'
            )
        if not self.DATABASE_URL:
            raise RuntimeError("DATABASE_URL 未配置，请复制 .env.example 为 .env 并填写。")
        if self.STORAGE_BACKEND not in ("local", "s3"):
            raise RuntimeError(f"STORAGE_BACKEND 只能是 local 或 s3，当前为 {self.STORAGE_BACKEND!r}")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def local_storage_path(self) -> Path:
        """本地存储根目录的绝对路径。"""
        p = Path(self.LOCAL_STORAGE_ROOT)
        if not p.is_absolute():
            p = BASE_DIR / p
        return p.resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()