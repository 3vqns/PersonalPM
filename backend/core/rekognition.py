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
    return boto3.client(
        "rekognition",
        region_name=settings.aws_region,
        config=Config(
            connect_timeout=settings.aws_connect_timeout_seconds,
            read_timeout=settings.aws_read_timeout_seconds,
            retries={"max_attempts": settings.aws_retry_attempts, "mode": "standard"},
        ),
    )
