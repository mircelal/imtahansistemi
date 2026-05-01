# OMR-Based Course Exam Management System

This project is a full-stack platform designed for courses to create OMR-based exams, generate answer sheet PDFs, and process bulk scan results.

## Services

- `frontend` (React + Vite) → `:3000`
- `backend` (FastAPI) → `:8000`
- `omr-service` (FastAPI + OMRChecker) → `:8001`
- `worker` (Celery)
- `postgres` → `:5432`
- `redis` → `:6379`
- `minio` → `:9000` (API), `:9001` (console)

## Getting Started

1. Copy `.env.example` to `.env` and fill in the values.
2. Run with Docker Compose:
   - `docker compose up --build`
   - The frontend code is bind-mounted from `./frontend` into the container. If `package.json` changes, you may need to remove the `imtahan_frontend_node_modules` volume: `docker compose down` + `docker volume rm imtahansistemi_imtahan_frontend_node_modules` (or the `npm install` entrypoint will re-run automatically).
3. For development (hot-reload):
   - `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (enables `--reload` for backend/omr)

## Roadmap

The system consists of a backend API, OMR microservice, Celery pipeline, answer sheet designer, scan panel, and reporting modules.
