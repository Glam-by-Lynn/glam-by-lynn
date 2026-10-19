"""Apply migrations safely when several containers start at once.

Running `alembic upgrade head` from each container's entrypoint races: two
processes try to create `alembic_version` simultaneously and the loser dies with

    duplicate key value violates unique constraint "pg_type_typname_nsp_index"
    DETAIL: Key (typname, typnamespace)=(alembic_version, 2200) already exists.

which is exactly what happened the first time two containers were started
together. A Postgres advisory lock serialises them: the first migrates, the
others wait and then find the schema already at head and do nothing.

The lock is advisory and session-scoped, so it is released even if this process
is killed — a crash can't leave migrations permanently blocked.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.core.config import settings

logger = logging.getLogger(__name__)

# Arbitrary but fixed: every container must pick the same number for the lock
# to mean anything.
MIGRATION_LOCK_KEY = 8_314_027_591_004_211

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def run_migrations() -> None:
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as connection:
        logger.info("waiting for the migration lock")
        # Blocks until acquired, so concurrent starters queue rather than race.
        connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": MIGRATION_LOCK_KEY})
        connection.commit()
        logger.info("migration lock acquired")

        try:
            config = Config(str(BACKEND_ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
            command.upgrade(config, "head")
        finally:
            connection.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": MIGRATION_LOCK_KEY}
            )
            connection.commit()
            logger.info("migration lock released")

    engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="[migrate] %(message)s")
    try:
        run_migrations()
    except Exception:
        logger.exception("migrations failed")
        sys.exit(1)
