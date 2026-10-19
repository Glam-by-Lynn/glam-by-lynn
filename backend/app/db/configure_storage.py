"""Configure the storage provider from the environment, once, at deploy time.

Storage is **not** configured by environment variables: the factory reads
`storage_provider` and the provider's credentials from the `site_settings`
table, and the admin UI writes them (encrypting the secret). That's fine once
the site is running, but it can't bootstrap a fresh deployment — you'd need the
frontend deployed, Google OAuth working and an admin account, just to tell the
API where to put uploads.

This does the same writes as `PUT /api/admin/storage-settings`, including the
encryption, so a new environment can be configured before anything else exists.

Run it once, with the values in deploy/.env:

    docker compose -f deploy/docker-compose.yml --env-file deploy/.env \\
        run --rm api python -m app.db.configure_storage

Afterwards the values live (encrypted) in the database, so the environment
variables can be removed from deploy/.env if you'd rather not keep a second
copy.
"""
from __future__ import annotations

import logging
import os
import sys

from app.core.database import SessionLocal
from app.core.encryption import encrypt_value
from app.services import site_settings_service

logger = logging.getLogger(__name__)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is not set — add it to deploy/.env and re-run")
    return value


def configure_cloudinary(db) -> None:
    cloud_name = _require("CLOUDINARY_CLOUD_NAME")
    api_key = _require("CLOUDINARY_API_KEY")
    api_secret = _require("CLOUDINARY_API_SECRET")

    site_settings_service.upsert_setting(db, "storage_provider", "cloudinary")
    site_settings_service.upsert_setting(db, "storage_cloudinary_cloud_name", cloud_name)
    site_settings_service.upsert_setting(db, "storage_cloudinary_api_key", api_key)
    # Encrypted at rest with ENCRYPTION_KEY, exactly as the admin endpoint does.
    site_settings_service.upsert_setting(
        db, "storage_cloudinary_api_secret", encrypt_value(api_secret)
    )

    # Deliberately logs the cloud name but never the key or secret.
    logger.info("storage provider set to cloudinary (cloud: %s)", cloud_name)


def configure_s3(db) -> None:
    bucket = _require("S3_BUCKET_NAME")
    access_key = _require("AWS_ACCESS_KEY_ID")
    secret_key = _require("AWS_SECRET_ACCESS_KEY")
    region = os.environ.get("AWS_REGION", "us-east-1")

    site_settings_service.upsert_setting(db, "storage_provider", "s3")
    site_settings_service.upsert_setting(db, "storage_s3_bucket_name", bucket)
    site_settings_service.upsert_setting(db, "storage_s3_access_key_id", access_key)
    site_settings_service.upsert_setting(db, "storage_s3_region", region)
    site_settings_service.upsert_setting(
        db, "storage_s3_secret_access_key", encrypt_value(secret_key)
    )

    logger.info("storage provider set to s3 (bucket: %s, region: %s)", bucket, region)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[storage] %(message)s")

    provider = os.environ.get("STORAGE_PROVIDER", "").strip().lower()
    if provider not in {"cloudinary", "s3", "local"}:
        raise SystemExit(
            f"STORAGE_PROVIDER must be cloudinary, s3 or local (got: {provider or 'unset'})"
        )

    db = SessionLocal()
    try:
        if provider == "cloudinary":
            configure_cloudinary(db)
        elif provider == "s3":
            configure_s3(db)
        else:
            site_settings_service.upsert_setting(db, "storage_provider", "local")
            logger.warning(
                "storage provider set to local — uploads live in the container's "
                "volume and are lost if the instance is replaced"
            )
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        logger.exception("failed to configure storage")
        sys.exit(1)
