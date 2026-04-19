"""Helpers for normalizing Supabase/PostgREST response payloads."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def get_first_row(data: object) -> dict[str, Any] | None:
    """Return the first record from a mutation response, if present."""
    if isinstance(data, Mapping):
        return dict(data)

    if isinstance(data, list) and data:
        first_row = data[0]
        if isinstance(first_row, Mapping):
            return dict(first_row)

    return None
