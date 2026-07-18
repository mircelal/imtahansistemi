# OMR-Based Course Exam Management System

This project is a full-stack platform designed for courses to create OMR-based exams, generate answer sheet PDFs, and process bulk scan results.

## Services

- `frontend` (React + Vite) → `:3000`
- `backend` (FastAPI) → `:8000`
- `omr-service` (FastAPI + OMRChecker) → `:8001` — Docker build `backend/` qovluğunu da əlavə edir ki, OMR şablonu `get_omr_template` ilə PDF ilə eyni olsun.
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
4. **Cloudflare / public domain** (production build + nginx gateway):

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up --build -d
   ```

   **`.env` düzəlişləri** (domeninizi yazın):

   ```env
   CORS_ORIGINS=http://localhost:3002,https://sizin-domain.com
   GATEWAY_HTTP_PORT=80
   ```

   **Cloudflare DNS (klassik A record):**

   | Parametr | Dəyər |
   |----------|--------|
   | Type | A |
   | Name | `@` və ya `imtahan` |
   | Content | serverin **public IP**-si |
   | Proxy | ON (narıncı bulud) |
   | SSL/TLS | **Flexible** (origin HTTP :80) |

   Brauzerdə yalnız `https://sizin-domain.com` açın. API sorğuları eyni domen üzərindən `/api/...` gedir.

   **Vacib (Windows / Laragon):** 80 portu Laragon Apache ilə məşğul ola bilər. Həll yolları:

   - Laragon → Apache-ni dayandırın, sonra `GATEWAY_HTTP_PORT=80` ilə yenidən `up`
   - və ya **Cloudflare Tunnel** (port açmağa ehtiyac yoxdur):

     ```bash
     # .env-ə CLOUDFLARE_TUNNEL_TOKEN=... əlavə edin (Cloudflare Zero Trust → Tunnel)
     docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml -f docker-compose.cloudflare-tunnel.yml --profile tunnel up -d --build
     ```

     Tunnel public hostname: `http://gateway:80`

   **Yoxlama:** `docker exec imtahansistemi-gateway-1 wget -qO- http://127.0.0.1/health` → `{"status":"ok",...}`

5. Cavab kartı PDF-i yalnız **layout audit təmiz** olanda yaradılır (`POST /api/answer-sheets/generate` və qaralamanın təsdiqi **422** qaytarır — əvvəlki kimi zəif PDF MinIO-ya düşmür).

## Skan / OMR throughput

Emal sürəti server CPU-ya bağlıdır (sabit “yavaş” limit yoxdur):

- `CELERY_CONCURRENCY=0` → worker `nproc` qədər paralel `scan.process_sheet`
- `OMR_UVICORN_WORKERS=0` → OMR servisində eyni sayda uvicorn worker
- `OMR_EARLY_EXIT=1` → yaxşı kartda variant axtarışını tez kəsir

Təxmini: `throughput ≈ min(CELERY_CONCURRENCY, OMR_UVICORN_WORKERS) / sheet_seconds`.

## Roadmap

The system consists of a backend API, OMR microservice, Celery pipeline, answer sheet designer, scan panel, and reporting modules.
