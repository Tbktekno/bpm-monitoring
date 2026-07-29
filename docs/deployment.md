# Panduan Deployment — BPM & SpO₂ Monitoring Dashboard

Panduan lengkap untuk men-deploy aplikasi BPM & SpO₂ Monitoring Dashboard ke production menggunakan Docker.

---

## Daftar Isi

- [Arsitektur Production](#arsitektur-production)
- [Prasyarat](#prasyarat)
- [Persiapan Environment](#persiapan-environment)
- [Deployment dengan Docker](#deployment-dengan-docker)
- [Manual Deployment](#manual-deployment)
- [Database Migration](#database-migration)
- [Backup dan Restore](#backup-dan-restore)
- [Monitoring dan Logging](#monitoring-dan-logging)
- [Security Checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

---

## Arsitektur Production

```
                               ┌──────────────────┐
                               │   SSL/TLS        │
                               │   (Let's Encrypt) │
                               └────────┬─────────┘
                                        │
                                  ┌─────▼─────┐
                                  │  Nginx    │
                                  │  Reverse  │
                                  │  Proxy    │
                                  └─────┬─────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐      ┌──────▼──────┐     ┌─────▼─────┐
              │  Frontend  │      │   Backend   │     │   Redis   │
              │  (Vite     │      │  (Express)  │     │ (Session  │
              │   Build)   │      │  Port 5000  │     │  + Cache) │
              │  Port 80   │      │             │     └───────────┘
              └────────────┘      └──────┬──────┘
                                         │
                                   ┌─────▼─────┐
                                   │ PostgreSQL │
                                   │  Database  │
                                   │  Port 5432 │
                                   └────────────┘
```

---

## Prasyarat

### Docker

Pastikan Docker dan Docker Compose telah terinstall:

```bash
# Cek instalasi Docker
docker --version
# Output: Docker version 24.x.x

# Cek instalasi Docker Compose
docker compose version
# Output: Docker Compose version v2.x.x
```

### Domain dan SSL (Opsional)

- Nama domain (contoh: `monitoring.rumahsakit.com`)
- SSL certificate (Let's Encrypt / Cloudflare / lainnya)

### Server Requirements

| Spesifikasi | Minimum     | Rekomendasi |
|-------------|-------------|-------------|
| CPU         | 2 core      | 4 core      |
| RAM         | 2 GB        | 4 GB        |
| Storage     | 10 GB       | 20 GB SSD   |
| OS          | Ubuntu 22.04 | Ubuntu 24.04 |

---

## Persiapan Environment

### 1. Clone Repository di Server

```bash
cd /opt
git clone <repository-url> health-monitoring
cd health-monitoring
```

### 2. Buat File Environment Production

Buat file `.env` untuk backend:

```bash
cd backend
cp .env .env.production
nano .env.production
```

Isi file `.env.production`:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://bpm_user:bpm_password@localhost:5432/bpm_monitoring?schema=public"

# Server
PORT=5000
NODE_ENV=production

# JWT — GANTI dengan secret acak minimal 64 karakter
# Gunakan: openssl rand -hex 32
JWT_SECRET=your-super-secure-random-jwt-secret-that-is-at-least-64-characters-long
JWT_ISSUER=bpm-monitoring
JWT_EXPIRES_IN=24h
JWT_REMEMBER_EXPIRES_IN=7d

# gRPC
GRPC_HOST=localhost
GRPC_PORT=50051

# CORS — GANTI dengan domain frontend
CORS_ORIGIN=https://monitoring.rumahsakit.com
CORS_ORIGINS=https://monitoring.rumahsakit.com, https://admin.rumahsakit.com

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=200
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_ESP32_MAX=60
```

Buat file `.env` untuk frontend:

```bash
cd ../frontend
cp .env .env.production
nano .env.production
```

```env
VITE_API_BASE_URL=https://api.monitoring.rumahsakit.com/api/v1
VITE_SOCKET_URL=https://api.monitoring.rumahsakit.com
```

---

## Deployment dengan Docker

### 1. Buat Dockerfile Backend

Buat file `Dockerfile` di `backend/`:

```dockerfile
# backend/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/package*.json ./

EXPOSE 5000
EXPOSE 50051

CMD ["node", "dist/src/index.js"]
```

### 2. Buat Dockerfile Frontend

Buat file `Dockerfile` di `frontend/`:

```dockerfile
# frontend/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 3. Buat Nginx Configuration

Buat file `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name monitoring.rumahsakit.com;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. Buat Docker Compose File

Buat file `docker-compose.yml` di root proyek:

```yaml
version: '3.8'

services:
  # ─── PostgreSQL Database ────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: bpm-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: bpm_monitoring
      POSTGRES_USER: bpm_user
      POSTGRES_PASSWORD: bpm_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - bpm-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bpm_user -d bpm_monitoring"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Redis (Optional - for token blacklist + cache) ──────────
  redis:
    image: redis:7-alpine
    container_name: bpm-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - bpm-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Backend API ────────────────────────────────────────────
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: bpm-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 5000
      DATABASE_URL: "postgresql://bpm_user:bpm_password@postgres:5432/bpm_monitoring?schema=public"
      JWT_SECRET: "${JWT_SECRET}"
      JWT_ISSUER: "bpm-monitoring"
      JWT_EXPIRES_IN: "24h"
      JWT_REMEMBER_EXPIRES_IN: "7d"
      GRPC_HOST: "0.0.0.0"
      GRPC_PORT: "50051"
      CORS_ORIGIN: "${CORS_ORIGIN}"
      CORS_ORIGINS: "${CORS_ORIGINS}"
      RATE_LIMIT_GLOBAL_MAX: "200"
      RATE_LIMIT_AUTH_MAX: "10"
      RATE_LIMIT_ESP32_MAX: "60"
    ports:
      - "5000:5000"
      - "50051:50051"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - bpm-network
    volumes:
      - backend_logs:/app/logs

  # ─── Frontend ───────────────────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: bpm-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - bpm-network

  # ─── Nginx Reverse Proxy (Optional) ─────────────────────────
  nginx:
    image: nginx:alpine
    container_name: bpm-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - frontend
      - backend
    networks:
      - bpm-network

networks:
  bpm-network:
    driver: bridge

volumes:
  postgres_data:
  backend_logs:
```

### 5. Build dan Jalankan

```bash
# Set environment variables
export JWT_SECRET=$(openssl rand -hex 32)
export CORS_ORIGIN=https://monitoring.rumahsakit.com
export CORS_ORIGINS=https://monitoring.rumahsakit.com

# Build dan start semua service
docker compose up -d --build

# Cek status
docker compose ps

# Lihat logs
docker compose logs -f
```

### 6. Inisialisasi Database

```bash
# Masuk ke container backend
docker exec -it bpm-backend sh

# Generate Prisma Client
npx prisma generate

# Push schema ke database
npx prisma db push

# Seed database (jika diperlukan)
npm run db:seed

# Exit container
exit
```

### 7. Setup Nginx Reverse Proxy (Production)

Buat file `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    sendfile on;
    keepalive_timeout 65;

    # Security
    server_tokens off;

    include /etc/nginx/conf.d/*.conf;
}
```

Buat file `nginx/conf.d/default.conf`:

```nginx
# ─── Frontend ───────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name monitoring.rumahsakit.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ─── Backend API ─────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name api.monitoring.rumahsakit.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://backend:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for Socket.IO)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}

# ─── HTTP Redirect ──────────────────────────────────────
server {
    listen 80;
    server_name monitoring.rumahsakit.com api.monitoring.rumahsakit.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Manual Deployment (Tanpa Docker)

### 1. Setup PostgreSQL

```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-client

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database dan user
sudo -u postgres psql

CREATE DATABASE bpm_monitoring;
CREATE USER bpm_user WITH ENCRYPTED PASSWORD 'bpm_password';
GRANT ALL PRIVILEGES ON DATABASE bpm_monitoring TO bpm_user;
\c bpm_monitoring
GRANT ALL ON SCHEMA public TO bpm_user;
\q
```

### 2. Setup Backend

```bash
cd /opt/health-monitoring/backend

# Install dependencies
npm ci --only=production

# Generate Prisma Client
npx prisma generate

# Push schema
npx prisma db push

# Seed database (jika diperlukan)
npx prisma db seed

# Build TypeScript
npm run build

# Setup PM2 process manager
npm install -g pm2

# Jalankan dengan PM2
pm2 start dist/src/index.js --name bpm-backend
pm2 save
pm2 startup
```

### 3. Setup Frontend

```bash
cd /opt/health-monitoring/frontend

# Install dependencies
npm ci

# Build
npm run build

# Copy build output ke web server directory
sudo cp -r dist/* /var/www/html/
```

### 4. Setup Nginx

```bash
# Install Nginx
sudo apt install nginx

# Konfigurasi (lihat contoh di atas)
sudo nano /etc/nginx/sites-available/bpm-monitoring
sudo ln -s /etc/nginx/sites-available/bpm-monitoring /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Database Migration

### Dari SQLite ke PostgreSQL

Pindahkan database dari SQLite (development) ke PostgreSQL (production):

```bash
# 1. Export data dari SQLite
cd backend
npx prisma db push  # Pastikan schema sudah sync

# 2. Update DATABASE_URL ke PostgreSQL
nano .env
# DATABASE_URL="postgresql://bpm_user:bpm_password@localhost:5432/bpm_monitoring?schema=public"

# 3. Generate Prisma Client
npx prisma generate

# 4. Push schema ke PostgreSQL
npx prisma db push

# 5. Seed database
npm run db:seed
```

> **Catatan:** Untuk migrasi data yang sudah ada dari SQLite ke PostgreSQL, gunakan script migrasi khusus atau Prisma Studio untuk export/import data.

### Prisma Migrations (Production)

Untuk production, gunakan Prisma Migrations daripada `db push`:

```bash
# Generate migration file
npx prisma migrate dev --name init

# Apply migration ke production
npx prisma migrate deploy
```

---

## Backup dan Restore

### Backup Database (PostgreSQL)

```bash
# Backup harian
pg_dump -U bpm_user -h localhost bpm_monitoring > /backup/bpm-db-$(date +%Y%m%d).sql

# Backup dengan kompresi
pg_dump -U bpm_user -h localhost bpm_monitoring | gzip > /backup/bpm-db-$(date +%Y%m%d).sql.gz

# Backup Docker volume
docker exec -t bpm-postgres pg_dump -U bpm_user bpm_monitoring > /backup/bpm-db-$(date +%Y%m%d).sql
```

### Restore Database (PostgreSQL)

```bash
# Restore dari file SQL
psql -U bpm_user -h localhost bpm_monitoring < /backup/bpm-db-20260707.sql

# Restore dari file gzip
gunzip -c /backup/bpm-db-20260707.sql.gz | psql -U bpm_user -h localhost bpm_monitoring

# Restore Docker volume
cat /backup/bpm-db-20260707.sql | docker exec -i bpm-postgres psql -U bpm_user bpm_monitoring
```

### Backup Script Otomatis

Buat file `scripts/backup.sh`:

```bash
#!/bin/bash
# BPM Monitoring — Database Backup Script

BACKUP_DIR="/backup"
DB_NAME="bpm_monitoring"
DB_USER="bpm_user"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > "$BACKUP_DIR/bpm-db-$TIMESTAMP.sql.gz"

# Hapus backup lebih dari RETENTION_DAYS
find $BACKUP_DIR -name "bpm-db-*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# Log
echo "[$(date)] Backup completed: bpm-db-$TIMESTAMP.sql.gz" >> $BACKUP_DIR/backup.log
```

Setup cron job:

```bash
crontab -e

# Backup setiap jam 2 pagi
0 2 * * * /opt/health-monitoring/scripts/backup.sh
```

### Restore File Konfigurasi

Backup file konfigurasi penting:

```bash
# Backup environment files
cp backend/.env.production /backup/env-backend-$(date +%Y%m%d).bak
cp frontend/.env.production /backup/env-frontend-$(date +%Y%m%d).bak

# Backup Nginx config
cp -r /etc/nginx/sites-available/ /backup/nginx-$(date +%Y%m%d)/
```

---

## Monitoring dan Logging

### Health Check Endpoint

```bash
# Cek status server
curl https://api.monitoring.rumahsakit.com/api/health

# Response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-07-07T10:30:00.000Z",
    "uptime": 12345.67
  },
  "message": "Server is running"
}
```

### Log Monitoring

```bash
# Backend logs (Winston)
docker logs -f bpm-backend
tail -f /opt/health-monitoring/backend/logs/combined.log
tail -f /opt/health-monitoring/backend/logs/error.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# PM2 logs (manual deployment)
pm2 logs bpm-backend
```

### Docker Monitoring

```bash
# Cek resource usage
docker stats

# Cek logs container
docker logs bpm-backend --tail 100 -f
docker logs bpm-postgres --tail 50

# Cek health
docker ps --filter "health=healthy"
```

### Uptime Monitoring (Opsional)

Integrasikan dengan layanan monitoring seperti:

- **UptimeRobot** — monitoring HTTP uptime
- **Grafana** — visualisasi metrik database
- **Prometheus** — metrik sistem
- **Sentinel** — logging terpusat

### Alerting Threshold

| Metrik              | Warning          | Critical         | Tindakan                         |
|---------------------|------------------|------------------|----------------------------------|
| CPU Usage           | > 70%           | > 90%           | Scale up / optimasi              |
| RAM Usage           | > 75%           | > 90%           | Restart service / scale up       |
| Disk Usage          | > 80%           | > 90%           | Cleanup / tambah storage         |
| Database Connections | > 80%            | > 95%           | Tambah max_connections           |
| Response Time       | > 1000ms         | > 5000ms        | Optimasi query / scale up        |

---

## Security Checklist

### Sebelum Deploy Production

- [ ] **Ganti JWT_SECRET** — Gunakan string acak minimal 64 karakter
  ```bash
  openssl rand -hex 32
  ```
- [ ] **Ganti password admin default** — Login pertama kali, ganti password
- [ ] **Gunakan HTTPS** — Setup SSL certificate (Let's Encrypt)
- [ ] **Batasi CORS origin** — Set `CORS_ORIGINS` ke domain spesifik
- [ ] **Set NODE_ENV=production** — Nonaktifkan debug mode, stack trace disembunyikan
- [ ] **Aktifkan Helmet** — Security headers sudah aktif secara default
- [ ] **Konfigurasi rate limiting** — Sesuaikan dengan kebutuhan
- [ ] **Database hardening** — Gunakan password kuat untuk PostgreSQL
- [ ] **Firewall** — Buka port hanya yang diperlukan (80, 443, 5432 dari IP tertentu)
- [ ] **Regular backup** — Setup backup database otomatis
- [ ] **Monitoring** — Setup health check dan logging

### Enkripsi

| Komponen              | Metode                          |
|-----------------------|---------------------------------|
| Data in transit       | TLS 1.2 / 1.3                  |
| Data at rest (DB)     | AES-256 encryption             |
| Passwords             | bcrypt (salt rounds: 12)       |
| JWT signature         | HS256 (HMAC-SHA256)            |
| API keys (ESP32)      | SHA-256 hash storage           |

### Network Security

```bash
# Firewall dengan UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow from 10.0.0.0/8 to any port 5432  # Database (internal only)
sudo ufw enable
```

### Docker Security

```yaml
# Docker Compose security best practices
services:
  backend:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

---

## Troubleshooting

### Masalah: Database Connection Error

**Gejala:** `Can't reach database server`

**Solusi:**

```bash
# Cek koneksi PostgreSQL
docker exec -it bpm-postgres psql -U bpm_user -d bpm_monitoring -c "SELECT 1"

# Cek apakah service berjalan
docker ps | grep postgres

# Cek logs
docker logs bpm-postgres --tail 50

# Restart service
docker compose restart postgres
```

### Masalah: Permission Denied

**Gejala:** Error permission saat mengakses volume atau direktori

**Solusi:**

```bash
# Perbaiki permission
sudo chown -R 1000:1000 /opt/health-monitoring/backend/logs
sudo chmod -R 755 /opt/health-monitoring
```

### Masalah: Container Restart Loop

**Gejala:** Container restart terus-menerus

**Solusi:**

```bash
# Cek logs
docker logs bpm-backend --tail 100

# Cek health status
docker inspect bpm-backend | grep Health

# Restart dengan force
docker compose down
docker compose up -d

# Jika masih error, rebuild
docker compose up -d --build
```

### Masalah: SSL Certificate Error

**Gejala:** Browser menampilkan peringatan keamanan

**Solusi:**

```bash
# Install Certbot untuk Let's Encrypt
sudo apt install certbot python3-certbot-nginx

# Generate SSL certificate
sudo certbot --nginx -d monitoring.rumahsakit.com -d api.monitoring.rumahsakit.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Masalah: High Memory Usage

**Gejala:** Server kehabisan memory

**Solusi:**

```bash
# Cek memory usage
docker stats

# Batasi memory per container
docker compose update --memory-reservation="256m" --memory="512m" backend

# Atau di docker-compose.yml:
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

---

## Rollback Plan

### Rollback Docker Deployment

```bash
# Rollback ke versi sebelumnya
docker compose down

# Git checkout versi sebelumnya
git checkout <previous-commit-hash>

# Build dan deploy ulang
docker compose up -d --build

# Restore database jika diperlukan
cat /backup/bpm-db-20260707.sql | docker exec -i bpm-postgres psql -U bpm_user bpm_monitoring
```

### Rollback Manual Deployment

```bash
# Simpan backup build saat ini
cd /opt/health-monitoring
mv backend/dist backend/dist.bak
mv frontend/dist frontend/dist.bak

# Checkout versi sebelumnya
git checkout <previous-commit-hash>

# Build ulang
cd backend && npm run build
cd frontend && npm run build

# Restart services
pm2 restart bpm-backend
sudo systemctl restart nginx
```

---

## Catatan Penting

1. **Jangan gunakan SQLite untuk production** — Migrasikan ke PostgreSQL segera.
2. **Ganti semua secret default** — JWT_SECRET, API keys, password admin.
3. **Monitoring 24/7** — Setup health check dan alerting sejak awal.
4. **Backup rutin** — Database backup setiap hari, simpan di lokasi berbeda.
5. **Update dependency** — Lakukan audit keamanan dependency secara berkala.
6. **Gunakan load balancer** — Jika traffic tinggi, tambahkan multiple instance backend.
7. **Redis untuk production** — Gunakan Redis untuk token blacklist dan session cache.
