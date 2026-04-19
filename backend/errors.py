"""Stable API error shape and global exception handlers."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.logging import get_request_id

logger = logging.getLogger("pictureme.errors")


class AppError(Exception):
    """Application-level error with a stable JSON contract."""

    def __init__(self, message: str, code: str = "INTERNAL_ERROR", status: int = 500, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.details = details


def error_response(
    message: str,
    code: str,
    status: int,
    details: dict | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build a consistent error JSON response."""
    body: dict = {"message": message, "code": code}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status, content=body, headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    """Attach global exception handlers to the FastAPI app."""

    def _error_headers(request: Request) -> dict[str, str]:
        request_id = getattr(request.state, "request_id", None) or get_request_id()
        return {"X-Request-ID": request_id} if request_id and request_id != "-" else {}

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "App error on %s %s: %s (%s)",
            request.method,
            request.url.path,
            exc.message,
            exc.code,
        )
        return error_response(exc.message, exc.code, exc.status, exc.details, headers=_error_headers(request))

    @app.exception_handler(404)
    async def not_found_handler(request: Request, _exc: Exception) -> JSONResponse:
        return error_response("Not found", "NOT_FOUND", 404, headers=_error_headers(request))

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("Validation error on %s %s", request.method, request.url.path)
        return error_response(
            "Validation failed",
            "VALIDATION_ERROR",
            422,
            {"errors": exc.errors()},
            headers=_error_headers(request),
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return error_response("Internal server error", "INTERNAL_ERROR", 500, headers=_error_headers(request))
