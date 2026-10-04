# Deploying the backend to EC2 with Docker

The API, Redis and nginx run in containers on one EC2 instance. PostgreSQL does
**not** — it lives in RDS, so the database outlives the instance and AWS handles
backups and patching.

```
internet → nginx (TLS, :443) → api (:8000, internal only) → RDS
                                 ↓
                               redis (rate-limit counters, internal only)
```

Only nginx publishes ports. The API has no host port at all, which is what makes
it safe for it to trust the `X-Forwarded-For` header nginx sets.

---

## 1. AWS setup

**EC2.** A `t3.small` is a reasonable start (2 vCPU, 2 GB). `t3.micro` will run
it but leaves little headroom once Redis and nginx are alongside. Use Amazon
Linux 2023 or Ubuntu 22.04+, with a 20 GB+ root volume.

Security group:

| Port | Source | Why |
|------|--------|-----|
| 80 | 0.0.0.0/0 | ACME challenge and the redirect to HTTPS |
| 443 | 0.0.0.0/0 | the API |
| 22 | your IP only | SSH — never 0.0.0.0/0 |

**RDS.** PostgreSQL 15+, in the same VPC and availability zone as the instance
to avoid cross-AZ charges. **Do not make it publicly accessible**: its security
group should allow 5432 only from the EC2 instance's security group. Leave
automated backups on.

**DNS.** Point `api.glambylynn.com` at the instance's Elastic IP. Allocate an
Elastic IP — without one the address changes on every stop/start, and the TLS
certificate is issued against the name.

---

## 2. Install Docker on the instance

```bash
# Amazon Linux 2023
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user     # log out and back in

# Compose v2 plugin
sudo dnf install -y docker-compose-plugin   # or see docs.docker.com for Ubuntu
```

---

## 3. First deploy

```bash
git clone https://github.com/IngiaTech/glam-by-lynn.git
cd glam-by-lynn

cp deploy/.env.example deploy/.env
$EDITOR deploy/.env          # fill in every blank — see the file's comments
chmod 600 deploy/.env        # it holds live credentials
```

Set your domain in `deploy/nginx/conf.d/api.conf` — it appears three times
(`server_name` twice, and the certificate paths).

### Certificate, before nginx can start

nginx won't start without the certificate files, and certbot needs nginx to
answer the ACME challenge. Break the cycle by issuing the certificate first,
with certbot serving the challenge itself:

```bash
docker run --rm -p 80:80 \
  -v glam-by-lynn_certbot-conf:/etc/letsencrypt \
  -v glam-by-lynn_certbot-www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d api.glambylynn.com --email you@example.com --agree-tos --no-eff-email
```

Then bring everything up:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

The API container applies `alembic upgrade head` before serving — the equivalent
of Render's `preDeployCommand`.

### Check it

```bash
docker compose -f deploy/docker-compose.yml ps        # all healthy
curl https://api.glambylynn.com/health/db             # {"status":"healthy",...}
docker compose -f deploy/docker-compose.yml logs -f api
```

Expect `rate limiting: Redis store` in the API logs. If it says *in-process*,
`REDIS_URL` didn't reach the container and the limiter is per-container.

---

## 4. Updating

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Compose recreates the API container; nginx and Redis keep running. There are a
few seconds of downtime while the new container starts — acceptable here, and
avoidable later with two API containers behind nginx (see below).

---

## Things worth knowing

**Migrations and multiple containers.** The entrypoint applies migrations on
start, via `app.db.migrate`, which takes a Postgres advisory lock first. Start
several containers together and they queue: the first migrates, the rest wait
and then find the schema already at head.

This isn't theoretical. Calling `alembic upgrade head` directly from each
container — the obvious approach — was tried first and the second container
died immediately:

```
duplicate key value violates unique constraint "pg_type_typname_nsp_index"
DETAIL: Key (typname, typnamespace)=(alembic_version, 2200) already exists.
```

If you'd still rather migrate as an explicit step, set `RUN_MIGRATIONS=false`
on every container and run:

```bash
docker compose -f deploy/docker-compose.yml run --rm api python -m app.db.migrate
```

**`TRUSTED_PROXY_HOPS` must match the topology.** It's set to `1` in compose
because nginx is the single proxy. Putting a CloudFront distribution or an ALB
in front adds a hop and the value must rise to match — otherwise the limiter
reads an address the caller controls, and rate limiting can be bypassed by
rotating a header. If you move to an ALB, nginx becomes redundant.

**Uploads.** Prefer `STORAGE_PROVIDER=s3`. The `local` provider writes to a
Docker volume: it survives redeploys, but not instance replacement, and isn't
shared between containers.

**Secrets.** `deploy/.env` is the only copy of production credentials on the
box. It is gitignored; keep it `chmod 600`. Nothing secret is baked into the
image — `backend/.dockerignore` keeps `.env` out of the build context, which
matters because anyone who can pull the image can read every layer.

**Logs** are capped at 3 × 10 MB per container, so a chatty day can't fill the
root volume.

**Backups.** RDS automated backups cover the database. Also snapshot the
`uploads` volume if you use the local storage provider, since nothing else
holds those files.
