"""Environment validation and typed settings access."""

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings validated at startup from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    port: int = 8000
    node_env: Literal["development", "test", "production"] = "development"
    app_origin: str = "http://localhost:3000"
    frontend_origin: str = "http://localhost:5173"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    # Supabase
    supabase_url: str = Field(min_length=1)
    supabase_service_role_key: SecretStr
    face_profile_bucket: str = "face-profile-images"

    # AWS
    aws_region: str = "us-east-1"
    rekognition_collection_prefix: str = "pictureme-event"
    matching_similarity_threshold: float = 80.0
    matching_max_faces_per_selfie: int = 50

    # Cloudinary
    cloudinary_cloud_name: str = Field(min_length=1)
    cloudinary_api_key: SecretStr
    cloudinary_api_secret: SecretStr
    event_photo_folder: str = "pictureme/events"

    # Uploads
    max_event_photo_size_bytes: int = 15 * 1024 * 1024

    # Internal
    internal_api_secret: SecretStr

    # OAuth
    google_oauth_enabled: bool = True

    @property
    def is_development(self) -> bool:
        return self.node_env == "development"

    @property
    def public_config(self) -> dict[str, Any]:
        """Browser-safe config values that can be exposed to the frontend."""
        return {
            "appOrigin": self.app_origin,
            "frontendOrigin": self.frontend_origin,
            "googleOAuthEnabled": self.google_oauth_enabled,
        }

    @property
    def supabase_service_role_key_value(self) -> str:
        """Return the raw Supabase service role key for backend-only use."""
        return self.supabase_service_role_key.get_secret_value()

    @property
    def internal_api_secret_value(self) -> str:
        """Return the raw internal API secret for backend-only use."""
        return self.internal_api_secret.get_secret_value()

    @property
    def cloudinary_api_key_value(self) -> str:
        """Return the raw Cloudinary API key for backend-only use."""
        return self.cloudinary_api_key.get_secret_value()

    @property
    def cloudinary_api_secret_value(self) -> str:
        """Return the raw Cloudinary API secret for backend-only use."""
        return self.cloudinary_api_secret.get_secret_value()


@lru_cache
def getSettings() -> Settings:
    """Return a cached Settings instance. Fails fast on missing required config."""
    return Settings()
