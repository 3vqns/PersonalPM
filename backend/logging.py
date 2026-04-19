"""Backend logging configuration and request logging middleware."""

import contextvars
import logging
from json import dumps
from logging.config import dictConfig
from time import perf_counter
from uuid import uuid4

from fastapi import Request

from backend.config import Settings

request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Inject the active request id into each log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_context.get()
        return True


def get_request_id() -> str:
    """Return the active request id, if any."""
    return request_id_context.get()


def configure_logging(settings: Settings) -> None:
    """Configure application and uvicorn loggers from runtime settings."""
    log_level = settings.log_level.upper()

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s %(levelname)s [%(name)s] request_id=%(request_id)s %(message)s",
                }
            },
            "filters": {
                "request_id": {
                    "()": "backend.logging.RequestIdFilter",
                }
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                    "filters": ["request_id"],
                }
            },
            "root": {
                "level": log_level,
                "handlers": ["default"],
            },
            "loggers": {
                "uvicorn": {
                    "level": log_level,
                },
                "uvicorn.error": {
                    "level": log_level,
                },
                "uvicorn.access": {
                    "level": log_level,
                },
                "pictureme": {
                    "level": log_level,
                    "handlers": ["default"],
                    "propagate": False,
                },
            },
        }
    )


async def log_requests(request: Request, call_next):
    """Log one structured line per request with status and duration."""
    logger = logging.getLogger("pictureme.http")
    started_at = perf_counter()
    request_id = request.headers.get("x-request-id") or uuid4().hex
    request.state.request_id = request_id
    token = request_id_context.set(request_id)

    try:
        response = await call_next(request)
        duration_ms = (perf_counter() - started_at) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "Request completed %s",
            dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "durationMs": round(duration_ms, 2),
                    "client": request.client.host if request.client else None,
                }
            ),
        )
        return response
    except Exception:
        duration_ms = (perf_counter() - started_at) * 1000
        logger.exception(
            "Request failed %s",
            dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "durationMs": round(duration_ms, 2),
                    "client": request.client.host if request.client else None,
                }
            ),
        )
        raise
    finally:
        request_id_context.reset(token)
