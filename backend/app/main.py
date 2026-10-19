"""
Glam by Lynn - Main FastAPI Application
"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import check_db_connection
from app.core.middleware import (
    SecurityHeadersMiddleware,
    RateLimitMiddleware,
    AuthRateLimitMiddleware,
)
from app.core.observability import (
    RequestIDMiddleware,
    request_id_ctx,
    setup_logging,
)

# Configure logging before anything else so startup logs are captured.
setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# Initialize error tracking when a DSN is configured (production).
if settings.SENTRY_DSN:
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT)
        logger.info("Sentry error tracking initialized")
    except Exception as exc:  # never let observability wiring break boot
        logger.warning("Sentry initialization failed: %s", exc)

# Import routers
from app.routers import auth, services, bookings, gallery, testimonials, products as public_products, promo_codes as public_promo_codes, reviews as public_reviews, cart, wishlist, classes, site_settings as public_site_settings, whatsapp as whatsapp_router, categories as public_categories
from app.api.routes import brands, categories, products, product_images, product_variants, service_packages, orders
from app.api.routes.admin import locations as admin_locations, calendar as admin_calendar, bookings as admin_bookings, gallery as admin_gallery, users as admin_users, testimonials as admin_testimonials, promo_codes as admin_promo_codes, analytics as admin_analytics, classes as admin_classes, site_settings as admin_site_settings, storage_settings as admin_storage_settings, instagram_settings as admin_instagram_settings, orders as admin_orders

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise web application for makeup services and beauty product e-commerce",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# --- Middleware -------------------------------------------------------------
#
# ORDER MATTERS, AND IT IS INVERTED. `add_middleware` *prepends*, so the layer
# registered LAST is the OUTERMOST one, and a middleware that returns a
# response itself short-circuits everything registered before it.
#
# Request-ID is registered first here so it ends up innermost-but-one, and CORS
# last so it ends up outermost. CORS has to be outermost: when the rate limiter
# returns its own 429, that response never passes back through anything
# registered earlier, so with CORS on the inside a 429 carried no
# Access-Control-Allow-Origin header. The browser then reports a rate limit as
# "blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present"
# and fetch() rejects with "Failed to fetch" — which sends you looking at
# ALLOWED_ORIGINS for a problem that was never there. Observed in production on
# the admin settings page.
#
# Effective order, outermost → innermost:
#   CORS → auth rate limit → general rate limit → security headers → request id

# Request correlation id. No longer the outermost layer, so a CORS preflight
# that CORSMiddleware answers by itself gets no id — it also never reaches
# application code, so there is nothing to correlate it with.
app.add_middleware(RequestIDMiddleware)

# Add security headers
app.add_middleware(SecurityHeadersMiddleware)

# Add rate limiting (general)
app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=settings.RATE_LIMIT_PER_MINUTE,
    requests_per_hour=settings.RATE_LIMIT_PER_MINUTE * 60,
)

# Add stricter rate limiting for auth endpoints
app.add_middleware(AuthRateLimitMiddleware)

# Configure CORS. Registered last, so it wraps every layer above and its
# headers are present on their short-circuit responses too (see the note).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return a consistent JSON envelope for unhandled errors and log the trace.

    Without this, unhandled exceptions fall through to a plain-text 500 with no
    correlation id and no CORS headers, which reads as an opaque network error
    in the browser.
    """
    request_id = request_id_ctx.get()
    logger.exception(
        "Unhandled error on %s %s (request_id=%s)",
        request.method,
        request.url.path,
        request_id,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


# Health check endpoint
@app.get("/", tags=["Health"])
async def root():
    """Root endpoint - API health check"""
    return {
        "message": "Glam by Lynn API is running",
        "version": settings.APP_VERSION,
        "status": "healthy"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Detailed health check endpoint"""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }


@app.get("/health/db", tags=["Health"])
def database_health_check():
    """
    Database health check endpoint.

    Defined as a plain (sync) function so FastAPI runs the blocking DB round-trip
    in the threadpool instead of on the event loop. Use this as the deploy's
    health check path so a broken DB fails the deploy.

    Returns:
        JSONResponse: Database connection status
    """
    is_healthy = check_db_connection()
    status_code = 200 if is_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "database": "connected" if is_healthy else "disconnected",
            "status": "healthy" if is_healthy else "unhealthy"
        }
    )


# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(services.router, prefix="/api")  # Public services API
app.include_router(bookings.router, prefix="/api")  # Public bookings API
app.include_router(gallery.router, prefix="/api")  # Public gallery API
app.include_router(testimonials.router, prefix="/api")  # Public testimonials API
app.include_router(public_products.router)  # Public products API
app.include_router(public_categories.router, prefix="/api")  # Public categories API
app.include_router(public_promo_codes.router, prefix="/api")  # Public promo codes API
app.include_router(public_reviews.router, prefix="/api")  # Public reviews API
app.include_router(cart.router, prefix="/api")  # Shopping cart API
app.include_router(wishlist.router, prefix="/api")  # Wishlist API
app.include_router(classes.router, prefix="/api")  # Public classes API
app.include_router(brands.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(product_images.router, prefix="/api")
app.include_router(product_variants.router, prefix="/api")
app.include_router(service_packages.router, prefix="/api")  # Admin services API
app.include_router(orders.router, prefix="/api")  # Orders API
app.include_router(admin_locations.router, prefix="/api")  # Admin locations API
app.include_router(admin_calendar.router, prefix="/api")  # Admin calendar API
app.include_router(admin_bookings.router, prefix="/api")  # Admin bookings API
app.include_router(admin_gallery.router, prefix="/api")  # Admin gallery API
app.include_router(admin_testimonials.router, prefix="/api")  # Admin testimonials API
app.include_router(admin_promo_codes.router, prefix="/api")  # Admin promo codes API
app.include_router(admin_analytics.router, prefix="/api")  # Admin analytics API
app.include_router(admin_users.router, prefix="/api")  # Admin users API
app.include_router(admin_orders.router, prefix="/api")  # Admin order management API
app.include_router(admin_classes.router, prefix="/api")  # Admin classes API
app.include_router(admin_site_settings.router, prefix="/api")  # Admin site settings API
app.include_router(admin_storage_settings.router, prefix="/api")  # Admin storage settings API
app.include_router(admin_instagram_settings.router, prefix="/api")  # Admin Instagram settings API
app.include_router(public_site_settings.router, prefix="/api")  # Public site settings API
app.include_router(whatsapp_router.router, prefix="/api")  # WhatsApp deep-link API

# Serve uploaded files when using local storage (non-S3)
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
