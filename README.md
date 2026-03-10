# MyStagram

An Instagram-style web app built as a portfolio project. Users can publish posts, like, comment, follow each other, and browse a personalized feed. The full stack runs via Docker Compose — no local toolchain required.

**Live demo:** [mystagram.acharlas.dev](https://mystagram.acharlas.dev) — click **Demo** on the login page to explore instantly.

---

## Screenshots

| | |
|---|---|
| ![Login](docs/MyStagram_Login.png) | ![Feed](docs/MyStagram_Feed_Search.png) |
| ![New Post](docs/MyStagram_NewPost.png) | ![Profile](docs/MyStagram_Profile.png) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy (async), Alembic, Pydantic |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **Auth** | NextAuth.js v4 (credentials) + JWT access/refresh tokens |
| **Database** | PostgreSQL 16 + asyncpg |
| **Cache** | Redis 7 |
| **Storage** | MinIO (S3-compatible object storage) |
| **Infrastructure** | Docker Compose, Cloudflare Tunnel |

---

## Quick Start

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)

### 1. Configure environment

Create two env files at the repo root:

<details>
<summary><code>.env.backend</code></summary>

```
APP_ENV=local
BACKEND_API_URL=http://backend:8000
DATABASE_URL=postgresql+asyncpg://app:app@postgres:5432/instagram
REDIS_URL=redis://redis:6379/0
RATE_LIMIT_PROXY_SECRET=<shared-random-string>
MINIO_ENDPOINT=minio:9000
MINIO_BUCKET=instagram-media
MINIO_ACCESS_KEY=<your-minio-access-key>
MINIO_SECRET_KEY=<your-minio-secret-key>
SECRET_KEY=<random-string>
ALLOW_INSECURE_HTTP_COOKIES=true
```

`ALLOW_INSECURE_HTTP_COOKIES=true` is for local HTTP only. Keep it unset in production behind HTTPS.
</details>

<details>
<summary><code>.env.frontend</code></summary>

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost
NEXTAUTH_SECRET=<random-string>
RATE_LIMIT_PROXY_SECRET=<shared-random-string>
MEDIA_SIGNED_URL_ALLOWLIST=http://minio:9000
```

Use the same `RATE_LIMIT_PROXY_SECRET` in both files.
</details>

### 2. Run

```bash
# Production mode (frontend on port 80)
docker compose up --build -d

# Seed demo data (users, posts, comments, follows)
docker compose exec backend uv run python scripts/seed.py
```

Open [http://localhost](http://localhost) and log in with `demo_alex` / `password123`.

### 3. Development mode

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Enables hot reload (bind mounts) and exposes all service ports:

| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| MinIO API / Console | localhost:9000 / localhost:9001 |

### 4. Stop

```bash
docker compose down       # keep data
docker compose down -v    # drop volumes for clean reset
```

---

## Architecture

```
                    ┌─────────────┐
                    │  Cloudflare  │
                    │   Tunnel     │
                    └──────┬──────┘
                           │
               ┌───────────▼───────────┐
               │   Next.js Frontend    │  :80
               │   (App Router + BFF)  │
               └───────────┬───────────┘
                           │ internal
               ┌───────────▼───────────┐
               │   FastAPI Backend     │  :8000
               │   (REST API)          │
               └──┬────────┬────────┬──┘
                  │        │        │
            ┌─────▼──┐ ┌──▼───┐ ┌──▼────┐
            │Postgres│ │Redis │ │ MinIO  │
            │  :5432 │ │:6379 │ │ :9000  │
            └────────┘ └──────┘ └───────-┘
```

**Backend** (`backend/`) — Layered FastAPI app: `api/v1/` routes, `services/` business logic, `models/` ORM, `db/` session management. Uses UV as package manager.

**Frontend** (`frontend/`) — Next.js App Router with `(protected)/` and `(public)/` route groups. BFF API routes (`/api/*`) proxy requests to the backend with auth headers. Media is served through authenticated app routes, never directly from MinIO.

**Auth flow** — NextAuth.js credentials provider issues short-lived JWT access tokens + rotating refresh tokens. The frontend auto-refreshes via `jwt-lifecycle.ts` + `refresh-coordinator.ts`.

---

## Seed Data

The seed script creates demo users with posts, likes, comments, and follow relationships.

```bash
docker compose exec backend uv run python scripts/seed.py
```

| Account | Password |
|---|---|
| `demo_alex` | `password123` |
| `demo_bella` | `password123` |
| `demo_cara` | `password123` |

**Custom images:** Drop files into `backend/scripts/seed_media/` (auto-distributed) or `backend/scripts/seed_media/<username>/` (targeted). Re-run the seed script to upload them.

---

## Testing

```bash
# Backend (223 tests)
docker compose exec backend uv run pytest

# Frontend (267 tests)
docker compose exec frontend npm test
```

### Linting & Type Checking

```bash
# Backend
docker compose exec backend uv run ruff check .
docker compose exec backend uv run ruff format --check .
docker compose exec backend uv run mypy .

# Frontend
docker compose exec frontend npm run lint
```

---

## Production Checklist

Before exposing publicly:

- [ ] Set unique `SECRET_KEY` and `NEXTAUTH_SECRET`
- [ ] Set non-default MinIO credentials
- [ ] Run behind HTTPS (reverse proxy or Cloudflare Tunnel)
- [ ] Keep `ALLOW_INSECURE_HTTP_COOKIES` unset or `false`
- [ ] Do not publish Postgres/Redis/MinIO ports on the host

---

## License

Released under the MIT License. See [LICENSE](LICENSE) for details.
