# Production image for the Glam by Lynn API.
#
# Python 3.11 matches what requirements.txt was locked against (see
# requirements.in) — the lock won't install on 3.9, and resolving differently
# per interpreter is what made CI and local disagree before it existed.
#
# Two stages so the compiler toolchain needed to build any sdist stays out of
# the shipped image, which keeps it smaller and removes tools an attacker could
# use if they got a shell.

# ---------- build ----------
FROM python:3.11-slim AS build

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build-only: most wheels are prebuilt, but a source-only package would need a
# compiler, and failing at build time is better than at deploy time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install into a virtualenv so the result is one self-contained directory to
# copy into the runtime stage.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---------- runtime ----------
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# curl is used by the container healthcheck below. No compiler here.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user: a container breakout or RCE should not land on root.
RUN useradd --create-home --uid 10001 glam

COPY --from=build /opt/venv /opt/venv

WORKDIR /app
COPY --chown=glam:glam . .

# Local-disk uploads land here when STORAGE_PROVIDER is "local". Mount a volume
# over it in production — anything written into the image is lost on redeploy.
RUN mkdir -p /app/uploads && chown glam:glam /app/uploads

USER glam

EXPOSE 8000

# Checks the database too, not just the process: a container that can't reach
# RDS is not serving traffic, and should be reported unhealthy rather than
# silently 500-ing. Matches the path Render used as its health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl --fail --silent http://localhost:8000/health/db || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
