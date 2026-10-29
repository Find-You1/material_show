"""统一业务异常。所有可预期的错误都抛 AppError，由全局处理器转成统一响应体。"""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError


class AppError(Exception):
    """业务异常。

    响应体固定为 {"code": "...", "message": "..."}，前端拦截器按 code 分支处理。
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class NotFoundError(AppError):
    def __init__(self, message: str = "资源不存在") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "NOT_FOUND", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "没有操作权限", code: str = "FORBIDDEN") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, code, message)


class UnauthorizedError(AppError):
    def __init__(self, code: str = "UNAUTHORIZED", message: str = "请先登录") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, code, message)


class ConflictError(AppError):
    def __init__(self, message: str = "资源冲突") -> None:
        super().__init__(status.HTTP_409_CONFLICT, "CONFLICT", message)


class BadRequestError(AppError):
    def __init__(self, message: str = "请求参数有误", code: str = "BAD_REQUEST") -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, code, message)


def register_exception_handlers(app) -> None:
    @app.exception_handler(AppError)
    def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )

    @app.exception_handler(RequestValidationError)
    def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", []) if x not in ("body", "query", "path"))
        msg = first.get("msg", "参数校验失败")
        detail = f"{loc}: {msg}" if loc else msg
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"code": "VALIDATION_ERROR", "message": detail},
        )

    @app.exception_handler(IntegrityError)
    def _integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"code": "CONFLICT", "message": "数据冲突，请刷新后重试"},
        )

    @app.exception_handler(SQLAlchemyError)
    def _db_error(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"code": "DB_ERROR", "message": "数据库操作失败"},
        )