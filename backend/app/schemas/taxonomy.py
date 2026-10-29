"""分类与标签 schema。"""

from pydantic import BaseModel, ConfigDict, Field


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    cover_image_id: int | None = None
    sort_order: int
    image_count: int


class CategoryCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    slug: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=255)
    sort_order: int = 0

    model_config = ConfigDict(str_strip_whitespace=True)


class CategoryUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    slug: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=255)
    sort_order: int | None = None
    cover_image_id: int | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    image_count: int


class TagUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)

    model_config = ConfigDict(str_strip_whitespace=True)