#!/usr/bin/env bash
#
# Container entrypoint: apply migrations, then serve.
#
# On Render this was a `preDeployCommand`, which ran once per release before the
# new instance took traffic. Compose has no equivalent, so migrations run here —
# with the important caveat below about running more than one container.
set -euo pipefail

: "${PORT:=8000}"
: "${WEB_CONCURRENCY:=2}"
: "${RUN_MIGRATIONS:=true}"

if [ "${RUN_MIGRATIONS}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  # Deliberately not backgrounded and not tolerant of failure: starting an app
  # against a schema it doesn't expect produces confusing 500s rather than an
  # obvious, early failure.
  #
  # Goes through app.db.migrate rather than calling alembic directly, so that
  # several containers starting together serialise on a Postgres advisory lock.
  # Calling `alembic upgrade head` from each one races, and the loser dies
  # creating alembic_version — observed, not hypothetical.
  python -m app.db.migrate
  echo "[entrypoint] migrations applied"
else
  echo "[entrypoint] RUN_MIGRATIONS=false — skipping migrations"
fi

# Several containers starting at once is handled: app.db.migrate takes an
# advisory lock, so they queue instead of racing. RUN_MIGRATIONS=false remains
# available if you'd rather migrate as an explicit separate step.

echo "[entrypoint] starting API on port ${PORT} with ${WEB_CONCURRENCY} worker(s)"
# --forwarded-allow-ips='*' trusts X-Forwarded-* from any peer, which is only
# safe because this container publishes no host port: nginx on the internal
# compose network is the only thing that can reach it. Publishing 8000 to the
# host would make these headers attacker-settable — narrow this first if you do.
#
# It affects logging and request.url.scheme only. Rate limiting does its own
# trusted-proxy resolution via TRUSTED_PROXY_HOPS (see core/middleware.py) and
# does not rely on uvicorn's handling.
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${WEB_CONCURRENCY}" \
  --proxy-headers \
  --forwarded-allow-ips='*'
