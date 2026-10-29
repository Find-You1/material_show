"""搜索。

用 MySQL 8 内置的 ngram 全文索引，不引入 Elasticsearch。

四个必须遵守的约束：
1. MATCH(...) 的列清单必须与建索引时的列清单完全一致，否则报 ERROR 1191。
2. ngram_token_size 默认是 2，查询串短于 2 个字符必然匹配不到，必须走 LIKE 兜底。
3. 绝不能写成 MATCH(...) OR t.name LIKE ...，那会让优化器放弃全文索引退化成全表扫描。
   标签名已经冗余进 images.tag_text，所以一次 MATCH 就能覆盖标题 + 描述 + 标签。
4. ngram 会把「含停用词子串」的 bigram 整个丢掉，而 InnoDB 默认停用词表里有单字母
   a / i —— 于是 mi/in/ni/io 全被丢，「minio」这类含 i 或 a 的拉丁词在索引里一个
   token 都不剩，全文必然 0 命中（实测：mi / id / ik 查不到任何行，me / ed / ng / cd 正常）。
   所以全文 0 命中时也必须回落 LIKE，不能只按长度判断。
"""

from collections.abc import Sequence

from sqlalchemy import Select, and_, bindparam, case, func, or_, select, text
from sqlalchemy.orm import Session

from app.models.image import PUBLIC_FILTER, Image
from app.models.user import User
from app.services import image_service

# 必须与 alembic 迁移里 CREATE FULLTEXT INDEX 的列顺序完全一致
_MATCH_EXPR = (
    "MATCH(i.title, i.description, i.tag_text) "
    "AGAINST (:q IN NATURAL LANGUAGE MODE)"
)

_ORDER_SQL = {
    "relevance": "score DESC, i.favorites_count DESC, i.published_at DESC, i.id DESC",
    "latest": "i.published_at DESC, i.id DESC",
    "popular": "i.favorites_count DESC, i.downloads_count DESC, i.id DESC",
}

# LIKE 兜底没有 score 列，用 ORM 表达式给出等价排序
_ORDER_BY = {
    "relevance": (Image.favorites_count.desc(), Image.published_at.desc(), Image.id.desc()),
    "latest": (Image.published_at.desc(), Image.id.desc()),
    "popular": (Image.favorites_count.desc(), Image.downloads_count.desc(), Image.id.desc()),
}

# 少于这个字符数就走 LIKE：ngram_token_size=2 时单字查询一定返回 0 条
_MIN_FULLTEXT_LEN = 2


def search_images(
    db: Session,
    q: str,
    *,
    tag_slugs: Sequence[str] | None = None,
    category_id: int | None = None,
    order: str = "relevance",
    page: int = 1,
    size: int = 24,
) -> tuple[list[Image], int]:
    keyword = (q or "").strip()
    offset = (page - 1) * size
    order = order if order in _ORDER_SQL else "relevance"

    if len(keyword) < _MIN_FULLTEXT_LEN:
        ids, total = _search_by_like(
            db,
            keyword,
            tag_slugs=tag_slugs,
            category_id=category_id,
            order=order,
            offset=offset,
            size=size,
        )
    else:
        ids, total = _search_fulltext(
            db,
            keyword,
            tag_slugs=tag_slugs,
            category_id=category_id,
            order=order,
            offset=offset,
            size=size,
        )
        if not total:
            # ngram 丢掉了含停用词（a / i）的 bigram，拉丁关键词可能整词无 token。
            # 只在全文一条都没命中时才回落，正常分页时 total > 0、ids 为空，不受影响。
            ids, total = _search_by_like(
                db,
                keyword,
                tag_slugs=tag_slugs,
                category_id=category_id,
                order=order,
                offset=offset,
                size=size,
            )

    if not ids:
        return [], total
    return _load_in_order(db, ids), total


def _conditions(
    tag_slugs: Sequence[str] | None, category_id: int | None
) -> tuple[list[str], dict]:
    clauses = []
    params: dict = {}
    if category_id:
        clauses.append("AND i.category_id = :category_id")
        params["category_id"] = category_id
    if tag_slugs:
        # 在全文命中集合上做标签交集过滤，走 ix_image_tags_tag
        clauses.append(
            "AND EXISTS (SELECT 1 FROM image_tags it JOIN tags t ON t.id = it.tag_id "
            "WHERE it.image_id = i.id AND t.slug IN :slugs)"
        )
        params["slugs"] = list(tag_slugs)
    return clauses, params


def _search_fulltext(
    db: Session,
    keyword: str,
    *,
    tag_slugs: Sequence[str] | None,
    category_id: int | None,
    order: str,
    offset: int,
    size: int,
) -> tuple[list[int], int]:
    clauses, params = _conditions(tag_slugs, category_id)
    extra = "\n      ".join(clauses)
    base_where = (
        "i.audit_status = 'approved' AND i.is_deleted = 0 AND i.process_status = 'ready' "
        f"AND {_MATCH_EXPR}\n      {extra}"
    )

    rows_sql = text(
        f"""
        SELECT i.id, {_MATCH_EXPR} AS score
        FROM images i
        WHERE {base_where}
        ORDER BY {_ORDER_SQL[order]}
        LIMIT :limit OFFSET :offset
        """
    )

    count_sql = text(f"SELECT COUNT(*) FROM images i WHERE {base_where}")

    if tag_slugs:
        # 只有 SQL 里真的出现 :slugs 时才能声明 expanding 绑定，
        # 否则 SQLAlchemy 会抛 "doesn't define a bound parameter named 'slugs'"。
        rows_sql = rows_sql.bindparams(bindparam("slugs", expanding=True))
        count_sql = count_sql.bindparams(bindparam("slugs", expanding=True))

    bind = {**params, "q": keyword}
    ids = list(db.execute(rows_sql, {**bind, "limit": size, "offset": offset}).scalars())
    total = db.execute(count_sql, bind).scalar() or 0
    return ids, total


def _search_by_like(
    db: Session,
    keyword: str,
    *,
    tag_slugs: Sequence[str] | None,
    category_id: int | None,
    order: str,
    offset: int,
    size: int,
) -> tuple[list[int], int]:
    """LIKE 兜底：单字查询、以及全文索引丢 token 的拉丁关键词都走这里。"""
    stmt: Select = select(Image.id).where(
        PUBLIC_FILTER,
        or_(
            Image.title.contains(keyword, autoescape=True),
            Image.description.contains(keyword, autoescape=True),
            Image.tag_text.contains(keyword, autoescape=True),
        ),
    )
    if category_id:
        stmt = stmt.where(Image.category_id == category_id)
    if tag_slugs:
        from app.models.tag import Tag, image_tags

        stmt = stmt.where(
            Image.id.in_(
                select(image_tags.c.image_id)
                .join(Tag, Tag.id == image_tags.c.tag_id)
                .where(Tag.slug.in_(list(tag_slugs)))
            )
        )

    total = image_service.count_public(db, stmt)
    ids = list(
        db.scalars(
            stmt.order_by(*_ORDER_BY[order]).limit(size).offset(offset)
        )
    )
    return ids, total


def _load_in_order(db: Session, ids: list[int]) -> list[Image]:
    """按传入的 id 顺序返回图片对象（保住全文相关度排序）。"""
    rows = db.scalars(image_service.public_query().where(Image.id.in_(ids))).unique().all()
    by_id = {img.id: img for img in rows}
    return [by_id[i] for i in ids if i in by_id]


def search_users(
    db: Session,
    q: str,
    *,
    offset: int = 0,
    limit: int = 20,
    viewer_id: int | None = None,
) -> tuple[list[User], int]:
    """按用户名 / 昵称模糊搜用户，供搜索页「用户」标签用。

    排序：用户名完全一致 > 用户名前缀 > 其余，同级按已通过作品数与 id 倒序，
    这样输入完整用户名时当事人一定排第一。

    双向排除屏蔽关系：出现在结果里却不能关注，比不出现更让人困惑。
    """
    keyword = (q or "").strip()
    if not keyword:
        return [], 0

    from app.models.block import UserBlock

    conditions = [
        User.is_active.is_(True),
        or_(
            User.username.contains(keyword, autoescape=True),
            User.nickname.contains(keyword, autoescape=True),
        ),
    ]
    if viewer_id is not None:
        # 相关子查询：任意方向存在屏蔽记录就排除
        blocked = (
            select(UserBlock.id)
            .where(
                or_(
                    and_(
                        UserBlock.blocker_id == viewer_id, UserBlock.blocked_id == User.id
                    ),
                    and_(
                        UserBlock.blocker_id == User.id, UserBlock.blocked_id == viewer_id
                    ),
                )
            )
            .exists()
        )
        conditions.append(~blocked)

    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    if not total:
        return [], 0

    rank = case(
        (func.lower(User.username) == keyword.lower(), 0),
        (User.username.startswith(keyword, autoescape=True), 1),
        else_=2,
    )
    rows = list(
        db.scalars(
            select(User)
            .where(*conditions)
            .order_by(rank, User.approved_count.desc(), User.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return rows, total


def suggest_tags(db: Session, keyword: str, limit: int = 8):
    """按关键词补全标签，供搜索框下拉使用。"""
    from app.models.tag import Tag

    keyword = (keyword or "").strip()
    if not keyword:
        return []
    return list(
        db.scalars(
            select(Tag)
            .where(Tag.name.contains(keyword, autoescape=True))
            .order_by(Tag.image_count.desc(), Tag.id.desc())
            .limit(limit)
        )
    )