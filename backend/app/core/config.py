"""
Application configuration using Pydantic Settings
"""
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from typing import Annotated, List, Any
import json
import secrets


class Settings(BaseSettings):
    """Application settings with validation"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    # Application
    APP_NAME: str = "Glam by Lynn API"
    APP_VERSION: str = "1.0.0"
    # Default to the safe (production-like) posture; opt into DEBUG explicitly
    # in local development via the environment/.env.
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "sqlite:///./app.db"  # Default to SQLite for testing
    DATABASE_URL_ASYNC: str = "sqlite+aiosqlite:///./app.db"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    # Dedicated key for encrypting stored secrets (S3/Cloudinary/Instagram). When
    # set, it decouples data-at-rest encryption from SECRET_KEY so the JWT secret
    # can be rotated without making stored ciphertext undecryptable. Falls back to
    # SECRET_KEY-derived encryption when empty (see core/encryption.py).
    ENCRYPTION_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/api/auth/callback/google"

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"
    # NoDecode: parse this ourselves (see _split_csv) so a natural
    # comma-separated env value doesn't crash boot on JSON decoding.
    ALLOWED_ORIGINS: Annotated[List[str], NoDecode] = ["http://localhost:3000"]

    # AWS S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = ""

    # Email
    EMAIL_PROVIDER: str = "console"  # console | resend | sendgrid
    RESEND_API_KEY: str = ""
    SENDGRID_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@glambylynn.com"
    EMAIL_FROM_NAME: str = "Glam by Lynn"

    # Admin
    ADMIN_EMAILS: Annotated[List[str], NoDecode] = []

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Number of *trusted* reverse proxies in front of the app, used to pick the
    # real client IP out of X-Forwarded-For. XFF is appended to by each hop and
    # is attacker-controlled at the front, so the client IP is the Nth entry
    # from the right, where N is the number of proxies we actually run.
    #
    # 0 (the default) means "don't trust X-Forwarded-For at all". That's correct
    # on Render, where Cloudflare fronts every service and supplies the
    # non-forgeable CF-Connecting-IP header instead. Behind a single nginx or
    # ALB that you control (e.g. after a move to Docker on DO/AWS), set this
    # to 1.
    TRUSTED_PROXY_HOPS: int = 0

    # Shared store for rate-limit counters. Unset means per-process counters,
    # which is correct for one container and wrong for several: each would
    # allow the full quota independently (readiness finding H2).
    # Example: redis://redis:6379/0
    REDIS_URL: str = ""

    # Observability
    LOG_LEVEL: str = "INFO"
    SENTRY_DSN: str = ""

    @field_validator("ALLOWED_ORIGINS", "ADMIN_EMAILS", mode="before")
    @classmethod
    def _split_csv(cls, v: Any) -> Any:
        """Accept either a JSON array or a comma-separated string from the env.

        pydantic-settings would otherwise JSON-decode these list fields and
        crash the whole app (and the alembic migration step, which imports
        settings) if an operator enters the natural "a.com,b.com" form.
        """
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                return json.loads(s)
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        """Validate SECRET_KEY is secure in production."""
        # Get ENVIRONMENT from values (it's already been set)
        environment = info.data.get("ENVIRONMENT", "development")

        if environment == "production":
            # In production, SECRET_KEY must be at least 32 characters
            if len(v) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters in production"
                )
            # Must not be the default development key
            if v == "dev-secret-key-change-in-production":
                raise ValueError(
                    "SECRET_KEY must be changed from default value in production"
                )
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str, info) -> str:
        """Validate DATABASE_URL is set properly."""
        environment = info.data.get("ENVIRONMENT", "development")

        if environment == "production" and "sqlite" in v.lower():
            raise ValueError(
                "SQLite database should not be used in production. "
                "Use PostgreSQL or another production database."
            )
        return v

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def validate_allowed_origins(cls, v: List[str]) -> List[str]:
        """Ensure ALLOWED_ORIGINS is properly configured."""
        if not v:
            raise ValueError("ALLOWED_ORIGINS must contain at least one origin")
        # Validate format
        for origin in v:
            if not origin.startswith(("http://", "https://")):
                raise ValueError(
                    f"Invalid origin format: {origin}. Must start with http:// or https://"
                )
        return v

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Validate all production-critical settings."""
        if self.ENVIRONMENT == "production":
            # Ensure Google OAuth is configured
            if not self.GOOGLE_CLIENT_ID or not self.GOOGLE_CLIENT_SECRET:
                raise ValueError(
                    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in production"
                )

            # Ensure database is configured
            if not self.DATABASE_URL or self.DATABASE_URL == "sqlite:///./app.db":
                raise ValueError(
                    "DATABASE_URL must be properly configured in production"
                )

            # Debug mode should be off in production
            if self.DEBUG:
                raise ValueError(
                    "DEBUG should be set to False in production for security"
                )

            # Email must actually be deliverable in production. The console
            # provider only prints to logs while reporting success, so orders
            # and bookings would silently never notify anyone.
            if self.EMAIL_PROVIDER == "console":
                raise ValueError(
                    "EMAIL_PROVIDER must be a real provider (e.g. 'resend') in production, not 'console'"
                )
            if self.EMAIL_PROVIDER == "resend" and not self.RESEND_API_KEY:
                raise ValueError("RESEND_API_KEY must be set when EMAIL_PROVIDER=resend")
            if self.EMAIL_PROVIDER == "sendgrid" and not self.SENDGRID_API_KEY:
                raise ValueError("SENDGRID_API_KEY must be set when EMAIL_PROVIDER=sendgrid")

        return self

    def get_safe_config(self) -> dict:
        """
        Get configuration dict with sensitive values masked.

        Useful for logging or displaying config without exposing secrets.
        """
        config = self.model_dump()

        # Sensitive keys to mask
        sensitive_keys = [
            "SECRET_KEY",
            "DATABASE_URL",
            "DATABASE_URL_ASYNC",
            "GOOGLE_CLIENT_SECRET",
            "AWS_SECRET_ACCESS_KEY",
            "RESEND_API_KEY",
        ]

        # Mask sensitive values
        for key in sensitive_keys:
            if key in config and config[key]:
                # Show first 4 chars and mask the rest
                value = str(config[key])
                if len(value) > 4:
                    config[key] = value[:4] + "*" * (len(value) - 4)
                else:
                    config[key] = "*" * len(value)

        return config


settings = Settings()
