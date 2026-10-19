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

### Certificate

The DNS record is proxied by Cloudflare, so Let's Encrypt can't be used: an
HTTP-01 challenge is answered by Cloudflare and never reaches this box. Use a
**Cloudflare Origin Certificate** instead, which is valid while proxied and
needs no ACME challenge. Pick the 15-year lifetime unless you have a reason
not to — the dropdown also offers shorter ones, and a 1-year certificate is a
renewal you have to remember.

In the Cloudflare dashboard: **SSL/TLS → Origin Server → Create Certificate**.
Accept the defaults (covers `glambylynn.com` and `*.glambylynn.com`). Save the
two blocks it shows onto the instance:

```bash
mkdir -p ~/glam-by-lynn/deploy/nginx/certs
nano ~/glam-by-lynn/deploy/nginx/certs/origin.pem   # the certificate
nano ~/glam-by-lynn/deploy/nginx/certs/origin.key   # the private key
chmod 600 ~/glam-by-lynn/deploy/nginx/certs/origin.key
```

Then set the zone's SSL/TLS mode to **Full (strict)**. "Flexible" leaves the
Cloudflare→origin leg unencrypted, which defeats the purpose.

Check you have the right certificate before installing it — the dashboard
offers two very different things under Origin Server:

```bash
openssl x509 -in origin.pem -noout -ext extendedKeyUsage -ext subjectAltName
```

A **server** certificate says `TLS Web Server Authentication` and lists your
hostnames. The *Authenticated Origin Pulls* certificate says `TLS Web Client
Authentication` and carries no hostname at all — that one is Cloudflare's
client certificate for locking the origin to Cloudflare, and nginx cannot serve
it. See the commented `ssl_client_certificate` block in
`deploy/nginx/conf.d/api.conf` for where it does belong.

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

**Uploads.** Storage is configured in the **database**, not the environment:
the factory reads `storage_provider` and the provider credentials from
`site_settings`, where the admin UI writes them with the secret encrypted. The
`STORAGE_PROVIDER` / `CLOUDINARY_*` / `AWS_*` entries in `deploy/.env` exist
only to bootstrap a new deployment, before there's a frontend or an admin
account to do it through:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
    run --rm api python -m app.db.configure_storage
```

Run that once; the database is the source of truth afterwards. Prefer
`cloudinary` or `s3` — `local` writes to a Docker volume that survives a
redeploy but not instance replacement, and isn't shared between containers.

**Certificate renewal.** Cloudflare lets you choose the lifetime when creating
an Origin Certificate, so check what yours actually says rather than assuming:

```bash
openssl x509 -in deploy/nginx/certs/origin.pem -noout -dates
```

The certificate currently installed expires **18 October 2027** — one year, not
the 15-year maximum. Put a reminder in the calendar: nothing renews it
automatically, and when it lapses Cloudflare returns 526 errors under Full
(strict) while the origin itself looks perfectly healthy.

Replacing it is: create a new certificate in the dashboard, overwrite
`deploy/nginx/certs/origin.pem` and `.key`, then
`docker compose -f deploy/docker-compose.yml restart nginx`.

**Secrets.** `deploy/.env` is the only copy of production credentials on the
box. It is gitignored; keep it `chmod 600`. Nothing secret is baked into the
image — `backend/.dockerignore` keeps `.env` out of the build context, which
matters because anyone who can pull the image can read every layer.

**Logs** are capped at 3 × 10 MB per container, so a chatty day can't fill the
root volume.

**Backups.** RDS automated backups cover the database. Also snapshot the
`uploads` volume if you use the local storage provider, since nothing else
holds those files.
