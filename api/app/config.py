from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    PROJECT_NAME: str = "app"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    LOG_LEVEL: str = "DEBUG"
    SECRET_KEY: str = ""
    SQLALCHEMY_DATABASE_URI: str = ""
    SQLALCHEMY_ECHO: bool = False
    SECURE_COOKIE: bool = True

    CORS_ORIGINS: str = "http://localhost:3000"
    # The internal surface only answers the staff console, never the customer
    # app or the landing page.
    INTERNAL_CORS_ORIGINS: str = "http://localhost:3002"

    # JWT Token settings
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    JWT_ALGORITHM: str = "HS256"

    # Organization invite links point at the customer app and stay valid for
    # this long.
    APP_URL: str = "http://localhost:3001"
    INVITE_EXPIRE_DAYS: int = 14

    # AI (Pydantic AI + Gemini). The key is only ever read server-side; with no
    # key the AI endpoints answer 503 and planning works without them.
    GOOGLE_API_KEY: str = ""
    AI_MODEL: str = "gemini-3.5-flash-lite"
    AI_TIMEOUT_SECONDS: float = 30.0
    # Per-user calls per minute before we refuse locally, so one person can't
    # spend the organization's (low, free-tier) provider quota.
    AI_RATE_LIMIT_PER_MINUTE: int = 6

    # Cloudflare API token for SSL certificates
    CLOUDFLARE_API_TOKEN: str | None = None

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v):
        if not v or not v.strip():
            raise ValueError(
                "SECRET_KEY cannot be empty. Set SECRET_KEY environment variable."
            )
        return v

    @field_validator("SQLALCHEMY_DATABASE_URI")
    @classmethod
    def validate_database_uri(cls, v):
        if not v or not v.strip():
            raise ValueError(
                "SQLALCHEMY_DATABASE_URI cannot be empty. Set SQLALCHEMY_DATABASE_URI environment variable."
            )
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def internal_cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.INTERNAL_CORS_ORIGINS.split(",")]


settings = Settings()
