"""Shared backend-owned Supabase admin client access."""

from functools import lru_cache

from supabase import Client, create_client

from backend.config import getSettings


@lru_cache
def get_supabase_admin_client() -> Client:
    """Return a cached Supabase client configured with the service role key."""
    settings = getSettings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key_value)
