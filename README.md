# Instagram Core Clone

mystagram is a lightweight Instagram-style demo that focuses on the essentials: authenticated users can publish posts, react with likes, leave comments, and follow each other. Everything runs locally via Docker Compose with a FastAPI backend, a Next.js frontend, and a handful of supporting services (PostgreSQL, Redis, MinIO).

---

## Screenshots

![Login page for MyStagram](docs/MyStagram_Login.png)
![Home feed with search results](docs/MyStagram_Feed_Search.png)
![Create new post flow](docs/MyStagram_NewPost.png)
![User profile view](docs/MyStagram_Profile.png)

---

## Project Overview

- **Backend** — FastAPI application that exposes REST endpoints, handles authentication, and processes media.
- **Frontend** — Next.js App Router client that renders the feed, detail pages, and profile tools.
- **Infrastructure** — Docker Compose starts the full stack, including PostgreSQL, Redis, and MinIO for object storage.

The repository is organised as:

```
.
├── backend/            # FastAPI codebase
├── frontend/           # Next.js codebase
├── docker-compose.yml  # Showcase runtime (internet-facing demo baseline)
├── docker-compose.dev.yml # Development override (hot reload + tool ports)
├── .env.backend        # Backend environment values (not committed)
├── .env.frontend       # Frontend environment values (not committed)
└── README.md
```

---

## Environment Files

Create the following files at the repository root before running any services. Use placeholder values locally and keep production secrets private.

### `.env.backend`
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

`ALLOW_INSECURE_HTTP_COOKIES=true` is for local Docker HTTP only; keep it unset/false in staging and production.

### `.env.frontend`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MINIO_BASE_URL=http://minio:9000/instagram-media
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-string>
RATE_LIMIT_PROXY_SECRET=<shared-random-string>
```

Keep `NEXT_PUBLIC_MINIO_BASE_URL` on the Docker-internal hostname (`minio`) when using Next image optimization in containers.
Set the same `RATE_LIMIT_PROXY_SECRET` value in both `.env.backend` and `.env.frontend` so auth rate limiting can distinguish users behind the frontend container.

The sample values above are safe defaults for local development. Replace the placeholders (`<...>`) with secrets when deploying elsewhere and keep those keys out of version control.

---

## Quick Start

1. **Install prerequisites**
   - Docker Desktop (or Docker Engine + Compose v2)

2. **Boot showcase mode (default)**
   ```bash
   docker compose up --build -d
   ```
   - Frontend: http://localhost:3000
   - A one-shot `minio-init` job auto-creates the media bucket and applies read policy for demo assets.
   - Only frontend is published to host.
   - PostgreSQL, Redis, and MinIO stay on the internal Docker network.

3. **Optional: boot development mode (hot reload + infra tool ports)**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```
   - Enables bind mounts and reload for backend/frontend.
   - Backend docs: http://localhost:8000/docs
   - Exposes PostgreSQL (5432), Redis (6379), MinIO API (9000), MinIO console (9001).

4. **Seed demo data (users, follows, posts with captions and placeholder images)**
   ```bash
   docker compose exec backend uv run python scripts/seed.py
   ```
   Seeded users are assigned the same default avatar key used by registration (`avatars/default/default-avatar.png`).

   Demo accounts:
   - `demo_alex` / `password123`
   - `demo_bella` / `password123`
   - `demo_cara` / `password123`

   Optional: use your own images for a richer feed.
   - Fast path: put images directly in `backend/scripts/seed_media/` and they will be auto-distributed across demo users.
   - Or target a user: `backend/scripts/seed_media/<username>/<image-file>`.
   - Example: `backend/scripts/seed_media/demo_alex/beach.jpg`
   - Re-run seed; files are uploaded to MinIO and used as feed posts.
   - Custom media path:
     ```bash
     docker compose exec -e SEED_MEDIA_DIR=/app/scripts/seed_media backend uv run python scripts/seed.py
     ```

5. **Stop the stack**
   ```bash
   docker compose down
   ```
   Add `-v` to drop local volumes if you need a clean reset.

Dismissed-notification backlog cleanup is launched in background at backend container startup.
Set `DISMISSED_PRUNE_ON_STARTUP=false` in `.env.backend` to skip it.
Startup prune is bounded by default:
- `DISMISSED_MAX_USERS_PER_RUN=200`
- `DISMISSED_MAX_ROWS_PER_RUN=5000`
- `DISMISSED_MAX_ELAPSED_SECONDS=30`

Default avatar asset is synchronized to MinIO at backend startup from:
- `backend/assets/default_avatars/default-avatar.png`

Set `SYNC_DEFAULT_AVATARS_ON_STARTUP=false` in `.env.backend` to skip this sync step.
You can run it manually:
```bash
docker compose exec backend uv run python scripts/sync_default_avatars.py
```

You can still run it manually:
```bash
docker compose exec backend uv run python scripts/prune_dismissed_notifications.py
```

---

## Runtime Model

This project is Docker-only. Run backend and frontend through `docker compose`; direct host execution with `npm`, `uv`, or `python` is not a supported workflow.

For portfolio demos reachable from the internet, use the default `docker-compose.yml` mode and keep infra services private.

## Demo Guardrails

Before exposing the app publicly (even as a demo), ensure:
- `SECRET_KEY` and `NEXTAUTH_SECRET` are unique non-default values.
- MinIO root credentials are non-default.
- You run behind HTTPS/TLS at the edge (reverse proxy or tunnel).
- You do not publish Postgres/Redis/MinIO ports on the host.

---

## Contributing & Support

Feel free to open issues or pull requests for bug fixes, feature proposals, or documentation updates. Always avoid sharing real credentials in tickets or commits.

---

## License

This project is released under the MIT License. See `LICENSE` for details.
