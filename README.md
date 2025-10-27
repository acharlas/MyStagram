# Instragram Core Clone

Instragram is a lightweight Instagram-style demo that focuses on the essentials: authenticated users can publish posts, react with likes, leave comments, and follow each other. Everything runs locally via Docker Compose with a FastAPI backend, a Next.js frontend, and a handful of supporting services (PostgreSQL, Redis, MinIO).

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
├── docker-compose.yml  # Local runtime definition
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
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=<your-minio-access-key>
MINIO_SECRET_KEY=<your-minio-secret-key>
JWT_SECRET=<random-string>
```

### `.env.frontend`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MINIO_BASE_URL=http://localhost:9000/instagram-media
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-string>
```

The sample values above are safe defaults for local development. Replace the placeholders (`<...>`) with secrets when deploying elsewhere and keep those keys out of version control.

---

## Quick Start

1. **Install prerequisites**
   - Docker Desktop (or Docker Engine + Compose v2)
   - Node.js 20+ (only required if you plan to run the frontend outside Docker)

2. **Boot the stack**
   ```bash
   docker compose up --build
   ```
   - Frontend: http://localhost:3000  
   - Backend docs: http://localhost:8000/docs  
   - MinIO console: http://localhost:9001

3. **Stop the stack**
   ```bash
   docker compose down
   ```
   Add `-v` to drop local volumes if you need a clean reset.

---

## Local Development Tips

- **Backend**
  ```bash
  cd backend
  uv sync
  uv run uvicorn main:app --reload
  uv run pytest
  ```

- **Frontend**
  ```bash
  cd frontend
  npm install
  npm run dev
  npm run test
  ```

Use the Docker services for database, Redis, and storage even when running backend/frontend locally.

---

## Contributing & Support

Feel free to open issues or pull requests for bug fixes, feature proposals, or documentation updates. Always avoid sharing real credentials in tickets or commits.

---

## License

This project is released under the MIT License. See `LICENSE` for details.
