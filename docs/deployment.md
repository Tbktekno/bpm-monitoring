# Panduan Deployment — BPM & SpO₂ Monitoring Dashboard

Panduan men-deploy aplikasi ke production menggunakan Docker Compose / CI/CD.

---

## Daftar Isi

- [Arsitektur Production](#arsitektur-production)
- [Prasyarat](#prasyarat)
- [File Deployment di Repo](#file-deployment-di-repo)
- [Persiapan Environment](#persiapan-environment)
- [Deployment dengan Docker Compose](#deployment-dengan-docker-compose)
- [CI/CD (GitHub Actions)](#cicd-github-actions)
- [Manual Deployment](#manual-deployment)
- [Database Migration](#database-migration)
- [Backup dan Restore](#backup-dan-restore)
- [Monitoring dan Logging](#monitoring-dan-logging)
- [Security Checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

---

## Arsitektur Production

```
                        ┌──────────────┐
                        │  Nginx / TLS  │
                        └──────┬───────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
          ┌─────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐
          │  Frontend  │  │   Backend  │  │ PostgreSQL│
          │  (nginx    │  │  (Express  │  │  :5432   │
          │   :80)     │  │   :5000)   │  └──────────┘
          └────────────┘  │  gRPC:50051│
                          └────────────┘
```

Di dalam satu Docker network `bpm-network`:
- **postgres** — database (PostgreSQL 16).
- **backend** — Express + Socket.IO + gRPC (port 5000, 50051).
- **frontend** — nginx serving SPA + proxy `/api` dan `/socket.io` ke backend (port 80).

---

## Prasyarat

| Software | Versi |
|----------|-------|
| Docker | 24+ |
| Docker Compose | v2+ |
| Node.js (untuk build lokal) | 22+ |
| Domain + SSL (opsional) | Let's Encrypt / Cloudflare |

Server requirements:

| Spesifikasi | Minimum | Rekomendasi |
|-------------|---------|-------------|
| CPU | 2 core | 4 core |
| RAM | 2 GB | 4 GB |
| Storage | 10 GB | 20 GB SSD |
| OS | Ubuntu 22.04 | Ubuntu 24.04 |

---

## File Deployment di Repo

| File | Fungsi |
|------|--------|
| `docker-compose.yml` | Orchestrasi: postgres + backend + frontend |
| `backend/Dockerfile` | Build image backend (multi-stage, non-root user, healthcheck) |
| `frontend/Dockerfile` | Build image frontend (Vite build → nginx) |
| `frontend/nginx.conf` | Config nginx: SPA + proxy `/api` & `/socket.io` + security headers |
| `.github/workflows/ci.yml` | CI/CD: lint → test → build → push image ke GHCR |
| `.dockerignore` | Menghindari file tidak perlu masuk image |

---

## Persiapan Environment

### Backend (`backend/.env` — production)

```env
DATABASE_URL=postgresql://bpm_user:${POSTGRES_PASSWORD}@postgres:5432/bpm_monitoring
PORT=5000
NODE_ENV=production

JWT_SECRET=<acak min 64 karakter>       # openssl rand -hex 32
JWT_ISSUER=bpm-monitoring
JWT_EXPIRES_IN=24h
JWT_REMEMBER_EXPIRES_IN=7d

GRPC_HOST=0.0.0.0
GRPC_PORT=50051

CORS_ORIGIN=http://localhost:80
RATE_LIMIT_GLOBAL_MAX=200
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_ESP32_MAX=60
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=/api/v1      # relative → lewat nginx proxy
VITE_SOCKET_URL=               # empty → same origin
```

---

## Deployment dengan Docker Compose

Docker Compose (`docker-compose.yml`) membaca env wajib dari shell/`.env`:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`

### 1. Siapkan Environment

```bash
# .env di root
POSTGRES_PASSWORD=super-secret-db-password
JWT_SECRET=$(openssl rand -hex 32)
```

### 2. Build & Jalankan

```bash
# Build semua image
docker compose build

# Start semua service (background)
docker compose up -d

# Cek status
docker compose ps

# Lihat log
docker compose logs -f
```

### 3. Inisialisasi Database

Backend image sudah berisi Prisma schema. Jalankan sekali:

```bash
docker compose exec backend sh -c "npx prisma db push"
docker compose exec backend sh -c "npx prisma db seed"   # opsional
```

> Jika ingin seed otomatis, jalankan di dalam container backend atau gunakan init script.

### 4. Akses

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:80` |
| Backend API | `http://localhost:5000/api/v1` |
| Health check | `http://localhost:5000/api/health` |
| gRPC | `localhost:50051` |

### 5. Perintah Lain

```bash
npm run docker:up        # docker compose up -d
npm run docker:down      # docker compose down
npm run docker:logs      # docker compose logs -f
npm run docker:build     # docker compose build
```

---

## CI/CD (GitHub Actions)

Pipeline di `.github/workflows/ci.yml` berjalan pada push/PR ke `main` & `develop`:

### Tahapan

```
1. lint      → TypeScript check backend & frontend + oxlint frontend
2. test      → backend tests + frontend tests (coverage)
3. build     → build backend (dist) + frontend (dist) + upload artifact
4. docker    → build & push image ke GHCR (hanya pada push ke main/develop)
```

### Image Registry (GHCR)

Image dipush ke:
- `ghcr.io/{repo}/backend`
- `ghcr.io/{repo}/frontend`

Tag: `sha-{short}`, `{branch}`, `latest` (khusus main).

### Setup di GitHub

1. Repo → Settings → Secrets → Actions → tambahkan `POSTGRES_PASSWORD` (jika dipakai pipeline).
2. Docker job menggunakan `GITHUB_TOKEN` otomatis (permission `packages: write`).

---

## Manual Deployment (Tanpa Docker)

### 1. Setup PostgreSQL

```bash
sudo apt update && sudo apt install postgresql postgresql-client
sudo systemctl start postgresql && sudo systemctl enable postgresql

sudo -u postgres psql <<'SQL'
CREATE DATABASE bpm_monitoring;
CREATE USER bpm_user WITH ENCRYPTED PASSWORD 'bpm_password';
GRANT ALL PRIVILEGES ON DATABASE bpm_monitoring TO bpm_user;
\c bpm_monitoring
GRANT ALL ON SCHEMA public TO bpm_user;
SQL
```

### 2. Backend (PM2)

```bash
cd backend
npm ci
npx prisma generate
npx prisma db push          # atau migrate deploy
npm run build

npm install -g pm2
pm2 start dist/src/index.js --name bpm-backend
pm2 save
pm2 startup
```

### 3. Frontend

```bash
cd frontend
npm ci
npm run build               # menghasilkan dist/
# Salin dist/ ke web server (nginx), atau serve dengan pm2/nginx
```

### 4. Nginx (SPA + proxy)

Gunakan pola `frontend/nginx.conf` (lihat file di repo) yang sudah menyediakan:
- SPA fallback (`try_files ... /index.html`).
- Proxy `/api/` → backend.
- Proxy WebSocket `/socket.io/`.
- Security headers + gzip + caching aset.

---

## Database Migration

### SQLite → PostgreSQL

```bash
cd backend
# 1. Pastikan schema sync
npx prisma db push

# 2. Ubah DATABASE_URL di .env ke PostgreSQL
nano .env

# 3. Generate & push
npx prisma generate
npx prisma db push

# 4. (Opsional) seed data contoh
npm run db:seed
```

> Untuk migrasi data yang sudah ada, gunakan `npx prisma migrate deploy` dan tooling migrasi data khusus.

### Schema Update di Production

```bash
docker compose exec backend npx prisma db push    # dev-style
# atau (produksi yang lebih aman):
docker compose exec backend npx prisma migrate deploy
```

---

## Backup dan Restore

### Backup PostgreSQL

```bash
docker compose exec postgres pg_dump -U bpm_user bpm_monitoring > backup_$(date +%F).sql
```

### Restore

```bash
cat backup_2026-08-06.sql | docker compose exec -T postgres psql -U bpm_user bpm_monitoring
```

### Volume

Volume `postgres_data` menyimpan data. Untuk memindahkan server, backup dump SQL lalu restore di server baru.

---

## Monitoring dan Logging

### Log Aplikasi
| Sumber | Lokasi |
|--------|--------|
| Backend | `logs/combined.log`, `logs/error.log` (Winston) |
| Docker | `docker compose logs -f backend` |
| Nginx | `docker compose logs -f frontend` |

### Health Check
- Backend: `GET /api/health` (dipakai Docker HEALTHCHECK).
- Frontend: nginx merespons 200 pada `/`.

### Metrik & Alerting
Gunakan Docker resource stats:
```bash
docker stats
```
Untuk production skala besar, integrasikan Prometheus/Grafana atau platform cloud (opsional).

---

## Security Checklist

- [ ] `JWT_SECRET` acak ≥ 64 karakter.
- [ ] Ganti password admin default.
- [ ] `POSTGRES_PASSWORD` kuat & disimpan di secret manager.
- [ ] Gunakan PostgreSQL (bukan SQLite).
- [ ] `CORS_ORIGINS` eksplisit (domain production).
- [ ] HTTPS di depan nginx (TLS 1.2+).
- [ ] Ganti API key seed device.
- [ ] Nonaktifkan port yang tidak perlu (gRPC `50051` jika tidak dipakai).
- [ ] Isolasi jaringan IoT.
- [ ] Pantau log error berkala.
- [ ] Terapkan enkripsi ATS untuk data pasien sensitif (`nik`, `medicalHistory`).

---

## Troubleshooting

### Container backend crash loop
```bash
docker compose logs backend
```
Penyebab umum: `DATABASE_URL` salah, `JWT_SECRET` < 64 karakter, DB belum siap.

### `prisma db push` gagal
Pastikan service postgres sehat:
```bash
docker compose ps
docker compose exec postgres pg_isready -U bpm_user -d bpm_monitoring
```

### CORS / Socket.IO tidak konek
- Pastikan `CORS_ORIGIN` sesuai origin frontend.
- Pastikan proxy `/socket.io/` di nginx mendukung WebSocket (`Upgrade` headers).

### Frontend 404 saat refresh
Pastikan nginx memakai `try_files $uri $uri/ /index.html;` (sudah di `frontend/nginx.conf`).

### API key device ditolak
- Device harus terdaftar & aktif.
- Gunakan API key plaintext yang benar di header `x-api-key`.

---

## Lanjutkan Membaca

- [Setup Development](setup.md)
- [Keamanan](security.md)
- [Testing & CI](testing.md)
- [Arsitektur](architecture.md)
