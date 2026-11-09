"""Low-limit request fixtures for upload body admission."""

import asyncio
from types import SimpleNamespace

from backend.request_limits import RequestBodyLimitMiddleware


def test_upload_body_is_rejected_before_downstream_parse() -> None:
    downstreamRead = False

    async def downstream(scope, receive, send):
        nonlocal downstreamRead
        downstreamRead = True
        await receive()

    async def receive():
        return {"type": "http.request", "body": b"x" * (1024 * 1024 + 5), "more_body": False}

    messages = []

    async def send(message):
        messages.append(message)

    middleware = RequestBodyLimitMiddleware(downstream, SimpleNamespace(maxEventUploadInputBytes=4))
    asyncio.run(middleware({
        "type": "http", "method": "POST", "path": "/api/events/event-1/photos",
        "headers": [], "asgi": {"version": "3.0"},
    }, receive, send))
    assert downstreamRead is True
    assert messages[0]["type"] == "http.response.start"
    assert messages[0]["status"] == 413


def test_content_length_rejects_before_downstream() -> None:
    downstreamCalled = False

    async def downstream(scope, receive, send):
        nonlocal downstreamCalled
        downstreamCalled = True

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    messages = []

    async def send(message):
        messages.append(message)

    middleware = RequestBodyLimitMiddleware(downstream, SimpleNamespace(maxEventUploadInputBytes=4))
    asyncio.run(middleware({
        "type": "http", "method": "POST", "path": "/api/events/event-1/photos",
        "headers": [(b"content-length", str(1024 * 1024 + 5).encode())],
        "asgi": {"version": "3.0"},
    }, receive, send))
    assert downstreamCalled is False
    assert messages[0]["status"] == 413
