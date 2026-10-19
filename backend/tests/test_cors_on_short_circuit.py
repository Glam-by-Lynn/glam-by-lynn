"""CORS headers must survive responses the middleware stack returns itself.

The bug these guard against: `add_middleware` prepends, so the last-registered
middleware is the outermost one. CORSMiddleware was registered *first*, making
it innermost, so a 429 returned by the rate limiter never passed back through
it and carried no Access-Control-Allow-Origin header.

In a browser that does not look like a rate limit at all. It surfaces as

    Access to fetch at '.../api/admin/settings/instagram' from origin
    'https://www.glambylynn.com' has been blocked by CORS policy: No
    'Access-Control-Allow-Origin' header is present on the requested resource.

and fetch() rejects with "Failed to fetch" — sending you to inspect
ALLOWED_ORIGINS, which was correct the whole time. Observed in production.

These tests force the limiter to report "limited" rather than issuing a burst
of real requests, so no route runs and no database is needed.
"""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

ORIGIN = "https://www.glambylynn.com"


@pytest.fixture
def allowed_origin():
    """Make ORIGIN an allowed origin regardless of the local .env.

    The CORS middleware instance reads its allow-list once at import, so
    patching settings is not enough — the live instance has to be updated.
    """
    from starlette.middleware.cors import CORSMiddleware

    patched = []
    for middleware in app.user_middleware:
        if middleware.cls is CORSMiddleware:
            middleware.kwargs["allow_origins"] = [ORIGIN]
            patched.append(middleware)

    assert patched, "CORSMiddleware is not registered on the app"
    # Force the stack to be rebuilt with the new kwargs.
    app.middleware_stack = None
    yield
    app.middleware_stack = None


@pytest.fixture
def always_limited():
    """Report every request as rate-limited, so the limiter short-circuits."""
    async def limited(self, key, window_seconds, limit):
        return True, 30

    with patch(
        "app.core.rate_limit_store.InProcessRateLimitStore.hit", new=limited
    ):
        yield


class TestRateLimitResponseIsUsableFromABrowser:
    def test_429_carries_cors_headers(self, allowed_origin, always_limited):
        with TestClient(app) as client:
            response = client.get("/api/settings/public", headers={"Origin": ORIGIN})

        assert response.status_code == 429
        # The actual regression. Without this header the browser discards the
        # response and the caller sees a CORS error, not a 429.
        assert response.headers.get("access-control-allow-origin") == ORIGIN

    def test_429_is_still_a_429(self, allowed_origin, always_limited):
        """Guards against 'fixing' the above by not limiting at all."""
        with TestClient(app) as client:
            response = client.get("/api/settings/public", headers={"Origin": ORIGIN})

        assert response.status_code == 429
        assert response.headers.get("retry-after") == "30"


class TestCorsIsTheOutermostLayer:
    """Ordering is the root cause, so assert on it directly.

    A response-header check alone would pass again by accident if someone later
    reordered these and happened to leave CORS outside the limiter.
    """

    def test_cors_is_registered_last(self):
        from starlette.middleware.cors import CORSMiddleware

        classes = [m.cls for m in app.user_middleware]
        assert CORSMiddleware in classes, "CORSMiddleware is not registered"
        # add_middleware prepends, so "registered last" is index 0 and that is
        # the outermost layer.
        assert classes[0] is CORSMiddleware, (
            "CORSMiddleware must be the outermost middleware, otherwise "
            "short-circuit responses from the layers inside it (the rate "
            f"limiters) lose their CORS headers. Current order: {classes}"
        )
