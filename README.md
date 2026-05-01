# OMR Tabanli Kurs Sinav Yonetim Sistemi

Bu proje, kurslarin OMR tabanli sinav olusturmasi, cevap karti PDF uretmesi ve toplu tarama sonuclarini islemesi icin tasarlanmis full-stack bir platformdur.

## Servisler

- `frontend` (React + Vite) -> `:3000`
- `backend` (FastAPI) -> `:8000`
- `omr-service` (FastAPI + OMRChecker) -> `:8001`
- `worker` (Celery)
- `postgres` -> `:5432`
- `redis` -> `:6379`
- `minio` -> `:9000` (API), `:9001` (console)

## Baslangic

1. `.env.example` dosyasini `.env` olarak kopyalayin.
2. Docker compose ile calistirin:
   - `docker compose up --build`
   - Frontend kodu artık `./frontend` bind mount ile konteynere bağlanır; yalnız `package.json` değişince `imtahan_frontend_node_modules` hacmini silmek gerekebilir: `docker compose down` + `docker volume rm imtahansistemi_imtahan_frontend_node_modules` (veya `npm install` entrypoint tekrar çalışır).
3. Gelistirme icin:
   - `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (backend/omr `--reload` için)

## Yol Haritasi

Sistem, backend API, OMR microservice, Celery pipeline, cevap karti tasarimcisi, tarama paneli ve raporlama modullerinden olusur.
