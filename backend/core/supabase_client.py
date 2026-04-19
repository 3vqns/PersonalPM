"""Patched Supabase server-client construction for backend-only use."""

from __future__ import annotations

import re

from gotrue import SyncMemoryStorage
from supabase._sync.client import SyncClient, SupabaseException
from supabase.lib.client_options import SyncClientOptions as ClientOptions

_JWT_KEY_PATTERN = r"^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$"
_OPAQUE_KEY_PREFIXES = ("sb_secret_", "sb_publishable_")


class _ServerSyncClient(SyncClient):
    """Supabase sync client that accepts both legacy JWT and new opaque API keys."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        options: ClientOptions | None = None,
    ) -> None:
        if not supabase_url:
            raise SupabaseException("supabase_url is required")
        if not supabase_key:
            raise SupabaseException("supabase_key is required")
        if not re.match(r"^(https?)://.+", supabase_url):
            raise SupabaseException("Invalid URL")
        if not _is_supported_supabase_key(supabase_key):
            raise SupabaseException("Invalid API key")

        if options is None:
            options = ClientOptions(storage=SyncMemoryStorage())

        super().__init__(supabase_url, _coerce_key_for_parent_validation(supabase_key), options)
        self.supabase_key = supabase_key
        self.options.headers.update(self._get_auth_headers(self._create_auth_header(supabase_key)))


def create_supabase_server_client(supabase_url: str, supabase_key: str) -> SyncClient:
    """Create a backend-owned Supabase client that accepts modern server keys."""
    return _ServerSyncClient.create(
        supabase_url,
        supabase_key,
        options=ClientOptions(storage=SyncMemoryStorage()),
    )


def _is_supported_supabase_key(supabase_key: str) -> bool:
    return bool(re.match(_JWT_KEY_PATTERN, supabase_key)) or supabase_key.startswith(_OPAQUE_KEY_PREFIXES)


def _coerce_key_for_parent_validation(supabase_key: str) -> str:
    """Pass a JWT-shaped placeholder through parent validation for opaque keys."""
    if re.match(_JWT_KEY_PATTERN, supabase_key):
        return supabase_key
    return "a.a.a"
