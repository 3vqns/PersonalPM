"""Capability paths and untrusted request IDs must stay out of application logs."""

from starlette.requests import Request

from backend.app_logging import _validated_request_id, is_capability_request, redacted_request_path


def test_join_capability_path_is_redacted() -> None:
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/events/join/synthetic-secret/gallery",
        "headers": [],
        "query_string": b"",
    })

    assert redacted_request_path(request) == "/api/events/join/{token}/gallery"
    assert is_capability_request(request) is True


def test_unmatched_paths_do_not_log_unrecognized_capabilities() -> None:
    request = Request({
        "type": "http", "method": "GET", "path": "/unknown/synthetic-secret", "headers": [], "query_string": b"",
    })
    assert redacted_request_path(request) == "/unmatched"


def test_untrusted_request_id_cannot_inject_log_lines() -> None:
    requestId = _validated_request_id("synthetic-secret\nAuthorization: Bearer synthetic-secret")

    assert requestId != "synthetic-secret\nAuthorization: Bearer synthetic-secret"
    assert "\n" not in requestId
