"""Small sync retry helper for external service calls."""

from __future__ import annotations

import logging
from collections.abc import Callable
from time import sleep
from typing import TypeVar

T = TypeVar("T")


def run_with_retries(
    *,
    operation_name: str,
    attempts: int,
    backoff_seconds: float,
    logger: logging.Logger,
    func: Callable[[], T],
) -> T:
    """Run one callable with a small bounded retry loop."""
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return func()
        except Exception as exc:  # noqa: BLE001 - caller decides retry scope
            last_error = exc
            if attempt >= attempts:
                break
            logger.warning(
                "External operation failed and will be retried",
                extra={
                    "operation": operation_name,
                    "attempt": attempt,
                    "max_attempts": attempts,
                    "error": repr(exc),
                },
            )
            if backoff_seconds > 0:
                sleep(backoff_seconds * attempt)

    assert last_error is not None
    raise last_error
