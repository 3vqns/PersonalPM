"""Environment validation and typed settings access."""

from functools import lru_cache
from typing import Any, Literal

from pydantic import AliasChoices, Field, SecretStr
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
    app_origin: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("APP_ORIGIN", "VITE_API_BASE_URL"),
    )
    frontend_origin: str = "http://localhost:5173"
    frontend_origin_regex: str | None = r"https://personal-pm-frontend.*\.vercel\.app"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    # Supabase
    supabase_url: str = Field(min_length=1)
    supabase_service_role_key: SecretStr
    face_profile_bucket: str = "face-profile-images"

    # AWS
    aws_region: str = "us-east-1"
    rekognition_collection_prefix: str = "pictureme-event"
    aws_connect_timeout_seconds: float = Field(default=5.0, gt=0, le=60)
    aws_read_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    aws_retry_attempts: int = Field(default=3, ge=1, le=10)
    matching_similarity_threshold: float = Field(default=80.0, ge=0, le=100)
    matching_max_faces_per_selfie: int = Field(default=50, ge=1, le=4096)

    # Cloudinary
    cloudinary_cloud_name: str | None = Field(default=None, min_length=1)
    cloudinary_api_key: SecretStr | None = None
    cloudinary_api_secret: SecretStr | None = None
    account_avatar_folder: str = "pictureme/avatars"
    event_cover_folder: str = "pictureme/event-covers"
    event_photo_folder: str = "pictureme/events"
    external_retry_attempts: int = Field(default=3, ge=1, le=10)
    external_retry_backoff_seconds: float = Field(default=0.5, ge=0, le=5)

    # Uploads
    max_account_avatar_size_bytes: int = Field(default=5 * 1024 * 1024, gt=0)
    max_event_cover_size_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    max_event_photo_size_bytes: int = Field(default=15 * 1024 * 1024, gt=0)
    max_event_upload_batch_files: int = Field(default=50, ge=1, le=500)
    max_face_profile_selfie_size_bytes: int = Field(default=10 * 1024 * 1024, gt=0)

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
    def cors_allowed_origins(self) -> list[str]:
        """Return the explicit origins allowed to call the backend from browsers."""
        return list(dict.fromkeys([self.frontend_origin.rstrip("/"), self.app_origin.rstrip("/")]))

    def _require_str(self, value: str | None, env_name: str) -> str:
        """Return a required string setting or fail with a clear env var message."""
        if value:
            return value
        raise RuntimeError(f"Missing required environment variable: {env_name}")

    def _require_secret(self, value: SecretStr | None, env_name: str) -> str:
        """Return a required secret setting or fail with a clear env var message."""
        if value is not None:
            return value.get_secret_value()
        raise RuntimeError(f"Missing required environment variable: {env_name}")

    @property
    def supabase_service_role_key_value(self) -> str:
        """Return the raw Supabase service role key for backend-only use."""
        return self.supabase_service_role_key.get_secret_value()

    @property
    def internal_api_secret_value(self) -> str:
        """Return the raw internal API secret for backend-only use."""
        return self.internal_api_secret.get_secret_value()

    @property
    def cloudinary_cloud_name_value(self) -> str:
        """Return the raw Cloudinary cloud name for backend-only use."""
        return self._require_str(self.cloudinary_cloud_name, "CLOUDINARY_CLOUD_NAME")

    @property
    def cloudinary_api_key_value(self) -> str:
        """Return the raw Cloudinary API key for backend-only use."""
        return self._require_secret(self.cloudinary_api_key, "CLOUDINARY_API_KEY")

    @property
    def cloudinary_api_secret_value(self) -> str:
        """Return the raw Cloudinary API secret for backend-only use."""
        return self._require_secret(self.cloudinary_api_secret, "CLOUDINARY_API_SECRET")


@lru_cache
def getSettings() -> Settings:
    """Return a cached Settings instance. Fails fast on missing required config."""
    return Settings()
