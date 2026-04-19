"""Supabase server-client construction tests."""

from backend.core.supabase_client import create_supabase_server_client


def test_create_supabase_server_client_accepts_jwt_service_role_key() -> None:
    client = create_supabase_server_client(
        "https://example.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
    )

    assert client.supabase_url == "https://example.supabase.co"


def test_create_supabase_server_client_accepts_secret_key() -> None:
    client = create_supabase_server_client(
        "https://example.supabase.co",
        "sb_secret_abcdefghijklmnopqrstuvwxyz1234567890",
    )

    assert client.supabase_key == "sb_secret_abcdefghijklmnopqrstuvwxyz1234567890"
    assert client.options.headers["Authorization"] == "Bearer sb_secret_abcdefghijklmnopqrstuvwxyz1234567890"
