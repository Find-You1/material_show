"""注册与登录。"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.ratelimit import rate_limit
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import LoginIn, RegisterIn, TokenOut
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_for(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id, user.role), user=user)


# 限流挡注册轰炸：同一 IP 10 分钟内最多 5 次
@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register", 5, 600))],
)
def register(payload: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    return _token_for(auth_service.register(db, payload))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    return _token_for(auth_service.authenticate(db, payload.account, payload.password))