"""Tests for the rate-limit counter store (readiness finding H2, second half).

Counters used to live in a per-process dict, so N containers behind a proxy
each allowed the full quota and the effective limit was N times the configured
one. REDIS_URL now switches the store to Redis, shared by every container.
"""
from unittest.mock import patch

import pytest

from app.core.rate_limit_store import (
    InProcessRateLimitStore,
    RedisRateLimitStore,
    build_rate_limit_store,
)


class TestInProcessStore:
    """Unchanged behaviour when REDIS_URL isn't set."""

    @pytest.mark.asyncio
    async def test_allows_requests_under_the_limit(self):
        store = InProcessRateLimitStore()

        for _ in range(4):
            limited, _ = await store.hit("k", 60, 5)
            assert limited is False

    @pytest.mark.asyncio
    async def test_blocks_once_the_limit_is_reached(self):
        store = InProcessRateLimitStore()

        for _ in range(5):
            assert (await store.hit("k", 60, 5))[0] is False

        limited, retry_after = await store.hit("k", 60, 5)
        assert limited is True
        assert 1 <= retry_after <= 60

    @pytest.mark.asyncio
    async def test_keys_are_independent(self):
        """One caller hitting the limit must not block a different one."""
        store = InProcessRateLimitStore()

        for _ in range(5):
            await store.hit("ip-a", 60, 5)

        assert (await store.hit("ip-a", 60, 5))[0] is True
        assert (await store.hit("ip-b", 60, 5))[0] is False

    @pytest.mark.asyncio
    async def test_old_hits_fall_out_of_the_window(self):
        store = InProcessRateLimitStore()

        for _ in range(5):
            await store.hit("k", 60, 5)
        assert (await store.hit("k", 60, 5))[0] is True

        # A zero-length window: everything recorded is already expired.
        assert (await store.hit("k", 0, 5))[0] is False


class TestStoreSelection:
    def test_in_process_when_redis_url_is_unset(self):
        with patch("app.core.rate_limit_store.settings.REDIS_URL", ""):
            assert isinstance(build_rate_limit_store(), InProcessRateLimitStore)

    def test_redis_when_configured(self):
        with patch("app.core.rate_limit_store.settings.REDIS_URL", "redis://localhost:6379/0"):
            store = build_rate_limit_store()
        assert isinstance(store, RedisRateLimitStore)

    def test_a_broken_redis_url_does_not_stop_the_app_booting(self):
        """Degrade to in-process rather than refuse to start."""
        with patch("app.core.rate_limit_store.settings.REDIS_URL", "not-a-valid-url://x"):
            assert isinstance(build_rate_limit_store(), InProcessRateLimitStore)


class TestRedisFailureIsNotAnOutage:
    @pytest.mark.asyncio
    async def test_requests_are_allowed_when_redis_is_unreachable(self):
        """A rate limiter is a guard rail, not the service.

        Blocking every request because the counter store is down trades a small
        abuse risk for a complete outage.
        """
        store = RedisRateLimitStore("redis://127.0.0.1:1/0")  # nothing listening

        limited, retry_after = await store.hit("k", 60, 5)

        assert limited is False
        assert retry_after is None

    @pytest.mark.asyncio
    async def test_the_outage_is_logged_once_not_per_request(self, caplog):
        store = RedisRateLimitStore("redis://127.0.0.1:1/0")

        for _ in range(5):
            await store.hit("k", 60, 5)

        warnings = [r for r in caplog.records if "rate limit store unavailable" in r.message]
        assert len(warnings) == 1, "a Redis outage should not log on every request"
