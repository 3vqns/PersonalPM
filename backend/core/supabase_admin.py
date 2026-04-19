"""Shared backend-owned Supabase admin client access."""

from functools import lru_cache

from supabase import Client

from backend.config import getSettings
from backend.core.supabase_client import create_supabase_server_client


@lru_cache
def get_supabase_admin_client() -> Client:
    """Return a cached Supabase client configured with the service role key."""
    settings = getSettings()
    return create_supabase_server_client(settings.supabase_url, settings.supabase_service_role_key_value)
