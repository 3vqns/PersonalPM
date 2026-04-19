"""Vercel FastAPI entrypoint.

Vercel scans the project root for a module-level ``app`` object. The real
application lives in ``backend.main``, so this file re-exports it without
changing the backend package structure.
"""

from backend.main import app

