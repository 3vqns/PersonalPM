"""Shared AWS Rekognition client access for event collection orchestration."""

from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.config import Config

from backend.config import getSettings


@lru_cache
def get_rekognition_client() -> BaseClient:
    """Return a cached Rekognition client configured for the app region."""
    settings = getSettings()
    client_kwargs = {
        "region_name": settings.aws_region,
        "config": Config(
            connect_timeout=settings.aws_connect_timeout_seconds,
            read_timeout=settings.aws_read_timeout_seconds,
            retries={"max_attempts": settings.aws_retry_attempts, "mode": "standard"},
        ),
    }

    if settings.aws_access_key_id_value and settings.aws_secret_access_key_value:
        client_kwargs["aws_access_key_id"] = settings.aws_access_key_id_value
        client_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key_value
        if settings.aws_session_token_value:
            client_kwargs["aws_session_token"] = settings.aws_session_token_value

    return boto3.client(
        "rekognition",
        **client_kwargs,
    )
