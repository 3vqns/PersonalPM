"""Early ASGI request-body caps for multipart upload routes."""

import re

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.config import Settings


class RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        bodyLimit = _body_limit(scope["method"], scope["path"], self.settings)
        if bodyLimit is None:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        contentLength = headers.get(b"content-length", b"")
        if contentLength.isdigit() and int(contentLength) > bodyLimit:
            await _reject_large_body(scope, receive, send)
            return

        receivedBytes = 0
        responseStarted = False

        async def cappedReceive():
            nonlocal receivedBytes
            message = await receive()
            if message["type"] == "http.request":
                receivedBytes += len(message.get("body", b""))
                if receivedBytes > bodyLimit:
                    raise RequestBodyTooLarge()
            return message

        async def trackedSend(message):
            nonlocal responseStarted
            if message["type"] == "http.response.start":
                responseStarted = True
            await send(message)

        try:
            await self.app(scope, cappedReceive, trackedSend)
        except Exception as exc:
            if not _contains_body_limit_error(exc) or responseStarted:
                raise
            await _reject_large_body(scope, receive, send)


def _contains_body_limit_error(exc: Exception) -> bool:
    if isinstance(exc, RequestBodyTooLarge):
        return True
    nested = getattr(exc, "exceptions", ())
    return any(_contains_body_limit_error(item) for item in nested if isinstance(item, Exception))


def _body_limit(method: str, path: str, settings: Settings) -> int | None:
    multipartOverhead = 1024 * 1024
    if method == "POST" and re.fullmatch(r"/api/events/[^/]+/photos", path):
        return settings.maxEventUploadInputBytes + multipartOverhead
    if method == "POST" and path == "/api/account/face-profile":
        return settings.max_face_profile_selfie_size_bytes * 5 + multipartOverhead
    if method == "PATCH" and path == "/api/account/profile":
        return settings.max_account_avatar_size_bytes + multipartOverhead
    if method == "POST" and path == "/api/events":
        return settings.max_event_cover_size_bytes + multipartOverhead
    if method == "PATCH" and re.fullmatch(r"/api/events/[^/]+", path):
        return settings.max_event_cover_size_bytes + multipartOverhead
    return None


async def _reject_large_body(scope: Scope, receive: Receive, send: Send) -> None:
    response = JSONResponse({"message": "Upload exceeds the request size limit", "code": "UPLOAD_TOO_LARGE"}, status_code=413)
    await response(scope, receive, send)
