"""Where rate-limit counters live.

The limiters kept their buckets in a per-process dict, which is correct for a
single process and wrong for anything else: two containers behind nginx each
allow the full quota, so the effective limit is the configured one multiplied by
however many containers are running. That was acceptable on Render (one
instance) and is the half of readiness finding H2 that was deferred until the
move to Docker.

`REDIS_URL` decides which store is used. Unset — local development, a single
container — keeps the in-process store and behaves exactly as before.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from typing import Dict, List, Optional, Protocol, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

# (is_limited, seconds_until_retry)
LimitResult = Tuple[bool, Optional[int]]


class RateLimitStore(Protocol):
    async def hit(self, key: str, window_seconds: int, limit: int) -> LimitResult:
        """Record a request against `key` and say whether it exceeds `limit`."""
        ...


class InProcessRateLimitStore:
    """Sliding window of request timestamps held in memory.

    Accurate within one process and invisible to every other one. Fine for
    local development and a single container.
    """

    def __init__(self) -> None:
        self._hits: Dict[str, List[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup(self, now: float) -> None:
        # Drop keys nothing has touched for an hour, so a long-running process
        # doesn't accumulate a bucket per IP it has ever seen.
        if now - self._last_cleanup < 3600:
            return
        cutoff = now - 3600
        for key in list(self._hits):
            kept = [ts for ts in self._hits[key] if ts > cutoff]
            if kept:
                self._hits[key] = kept
            else:
                del self._hits[key]
        self._last_cleanup = now

    async def hit(self, key: str, window_seconds: int, limit: int) -> LimitResult:
        now = time.time()
        self._cleanup(now)

        cutoff = now - window_seconds
        recent = [ts for ts in self._hits[key] if ts > cutoff]

        if len(recent) >= limit:
            self._hits[key] = recent
            retry_after = max(1, int(window_seconds - (now - min(recent))))
            return True, retry_after

        recent.append(now)
        self._hits[key] = recent
        return False, None


# Remove expired entries, count what's left, and only then record the new hit —
# as one atomic step, so two containers can't both read "under the limit" and
# both admit a request.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {1, oldest[2]}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window)
return {0, '0'}
"""


class RedisRateLimitStore:
    """Sliding window shared by every container, in Redis.

    One sorted set per key, scored by timestamp. The read-modify-write runs as a
    Lua script so it is atomic; doing it as separate commands would let two
    containers both see "under the limit" for the same final slot.

    If Redis is unreachable the request is **allowed**. A rate limiter is a
    guard rail, not the service: taking the whole site down because the counter
    store is unavailable trades a small abuse risk for a complete outage. The
    failure is logged rather than passed over in silence.
    """

    def __init__(self, url: str) -> None:
        import redis.asyncio as redis  # imported here so redis stays optional

        self._redis = redis.from_url(url, encoding="utf-8", decode_responses=True)
        self._script = self._redis.register_script(_SLIDING_WINDOW_LUA)
        self._warned = False

    async def hit(self, key: str, window_seconds: int, limit: int) -> LimitResult:
        now = time.time()
        try:
            limited, oldest = await self._script(
                keys=[key],
                args=[now, window_seconds, limit, f"{now}:{uuid.uuid4().hex}"],
            )
        except Exception:
            # Warn once per process: a Redis outage would otherwise log on
            # every single request.
            if not self._warned:
                self._warned = True
                logger.exception("rate limit store unavailable; allowing requests")
            return False, None

        if int(limited) == 1:
            retry_after = max(1, int(window_seconds - (now - float(oldest))))
            return True, retry_after

        return False, None

    async def close(self) -> None:
        await self._redis.aclose()


def build_rate_limit_store() -> RateLimitStore:
    """Redis when REDIS_URL is set, otherwise the in-process store."""
    url = getattr(settings, "REDIS_URL", "") or ""

    if not url:
        logger.info("rate limiting: in-process store (REDIS_URL not set)")
        return InProcessRateLimitStore()

    try:
        store = RedisRateLimitStore(url)
    except Exception:
        # A bad URL or a missing redis package shouldn't stop the app booting;
        # degrade to the in-process store, which is what we had before.
        logger.exception("rate limiting: Redis unavailable, falling back to in-process")
        return InProcessRateLimitStore()

    logger.info("rate limiting: Redis store")
    return store
