# Panduan Setup — BPM & SpO₂ Monitoring Dashboard

Panduan langkah demi langkah untuk menginstal, mengonfigurasi, dan menjalankan aplikasi di lingkungan **development**.

---

## Daftar Isi

- [Prasyarat](#prasyarat)
- [Clone Repository](#clone-repository)
- [Setup Backend](#setup-backend)
- [Setup Frontend](#setup-frontend)
- [Akses Aplikasi](#akses-aplikasi)
- [Menjalankan Semua Sekaligus](#menjalankan-semua-sekaligus)
- [Koneksi Perangkat IoT](#koneksi-perangkat-iot)
- [Troubleshooting](#troubleshooting)

---

## Prasyarat

| Software | Versi Minimum | Catatan |
|----------|---------------|---------|
| Node.js | 22+ | https://nodejs.org |
| npm | 10+ | Ikut terpasang dengan Node.js |
| Git | 2.x | https://git-scm.com |
| Browser | modern | Chrome/Edge/Firefox |
| (Opsional) Arduino IDE | 2.x | Untuk flash firmware ESP8266 |

Verifikasi instalasi:

```bash
node --version   # v22.x.x
npm --version    # 10.x.x
git --version    # git version 2.x.x
```

---

## Clone Repository

```bash
git clone https://github.com/Tbktekno/bpm-monitoring.git
cd bpm-monitoring
```

Struktur direktori utama:

```
bpm-monitoring/
├── backend/       # Backend (Express + TypeScript + Prisma)
├── frontend/      # Frontend (React + Vite + TypeScript)
├── firmware/      # Firmware ESP8266 + MAX30100
├── docs/          # Dokumentasi
└── docker-compose.yml
```

---

## Setup Backend

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Konfigurasi Environment Variables

File `.env` sudah tersedia di `backend/.env` untuk development. Jika perlu dibuat dari awal:

```bash
# Contoh backend/.env
DATABASE_URL="file:./dev.db"      # SQLite untuk development
PORT=5000
NODE_ENV=development

# JWT — minimal 64 karakter
JWT_SECRET=bpm-monitoring-dev-jwt-secret-key-that-is-at-least-sixty-four-characters-long-for-hs256
JWT_ISSUER=bpm-monitoring
JWT_EXPIRES_IN=24h
JWT_REMEMBER_EXPIRES_IN=7d

# gRPC
GRPC_HOST=localhost
GRPC_PORT=50051

# CORS
CORS_ORIGIN=http://localhost:5173

# Rate limiting (opsional)
RATE_LIMIT_GLOBAL_MAX=200
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_ESP32_MAX=60
```

> **PENTING:** Di production, `JWT_SECRET` harus string acak minimal 64 karakter (misal `openssl rand -hex 32`).

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Push Schema ke Database

```bash
npx prisma db push
```

> Untuk production (PostgreSQL), ubah `DATABASE_URL` di `.env` menjadi connection string PostgreSQL, lalu jalankan perintah yang sama.

### 5. Seed Database dengan Data Contoh

```bash
npm run db:seed
```

Hasil seed (data contoh):

| Data | Jumlah |
|------|--------|
| Admin user | 1 |
| Settings | 4 |
| Pasien | 6 |
| Sesi monitoring | 6 |
| Pembacaan vital sign | 60 (10 per sesi) |
| Perangkat ESP32 | 3 |

Contoh output:

```
🌱 Seeding database …

  ✓ Admin created: admin@monitoring-bpm.web.id
  ✓ 4 settings created
  ✓ 6 patients created
  ✓ 60 readings across 6 sessions
  ✓ 3 ESP32 devices created

✅ Seeding complete!
```

### 6. Buka Prisma Studio (Opsional)

```bash
npx prisma studio
```

Prisma Studio terbuka di `http://localhost:5555`.

### 7. Jalankan Development Server

```bash
npm run dev
```

Server berjalan di `http://localhost:5000`:

```
========================================
  BPM & SpO₂ Monitoring Dashboard
  Environment: development
  HTTP + Socket.IO: http://localhost:5000
  gRPC target: localhost:50051
========================================
```

Server otomatis restart saat ada perubahan kode (ts-node-dev).

### 8. Verifikasi Backend

```bash
# Health check
curl http://localhost:5000/api/health
```

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-08-06T...",
    "uptime": 12.34
  },
  "message": "Server is running"
}
```

---

## Setup Frontend

### 1. Install Dependencies

Buka terminal baru (biarkan backend tetap berjalan):

```bash
cd frontend
npm install
```

### 2. Konfigurasi Environment Variables

File `.env` tersedia di `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
```

Sesuaikan jika backend berjalan di host/port berbeda. Untuk mode proxy (default), `VITE_API_BASE_URL` juga dapat diatur ke `/api/v1` karena Vite sudah dikonfigurasi proxy di `vite.config.ts`.

### 3. Jalankan Development Server

```bash
npm run dev
```

Server berjalan di `http://localhost:5173`:

```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### 4. Development Proxy

`frontend/vite.config.ts` menyediakan proxy ke backend sehingga API bisa dipanggil dengan path relatif:

```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true,
    },
  },
},
```

---

## Akses Aplikasi

Buka browser ke **http://localhost:5173**

### Kredensial Login Default

| Field | Nilai |
|-------|-------|
| Email | `admin@monitoring-bpm.web.id` |
| Password | `Admin123!` |

> ⚠ Ganti password segera setelah masuk (menu Pengaturan → Ganti Password).

### Menu Navigasi

| Menu | Route | Fungsi |
|------|-------|--------|
| Dashboard | `/` | Statistik & grafik ringkasan |
| Monitoring | `/monitoring` | Monitoring real-time + mulai/stop sesi |
| Pasien | `/patients` | CRUD pasien |
| Riwayat | `/history` | Histori pembacaan + filter |
| Laporan | `/reports` | Laporan sesi/harian/bulanan + ekspor PDF/Excel |
| Perangkat | `/devices` | Manajemen ESP32/ESP8266 |
| Pengaturan | `/settings` | Threshold, profil, password |

---

## Menjalankan Semua Sekaligus

Dari root repository:

```bash
# Install semua dependencies
npm install
npm run db:generate
npm run db:push
npm run db:seed

# Jalankan backend + frontend sekaligus (concurrently)
npm run dev
```

Atau gunakan skrip yang tersedia:

| Skrip | Fungsi |
|-------|--------|
| `run-dev.bat` | Menjalankan development (Windows batch) |
| `run-dev.ps1` | Menjalankan development (PowerShell) |
| `run-test.bat` | Menjalankan test (Windows) |
| `run-test.sh` | Menjalankan test (Linux/macOS) |

---

## Koneksi Perangkat IoT

Agar perangkat ESP8266 dapat mengirim data, perangkat harus terdaftar di database. Seed sudah menyediakan 3 perangkat:

| Device ID | API Key (plaintext) | Label | Status |
|-----------|---------------------|-------|--------|
| `ESP32-ALPHA-001` | `bpm-sample-alpha-key-001` | Ruang Observasi 1 | Aktif |
| `ESP32-BETA-002` | `bpm-sample-beta-key-002` | Ruang IGD | Aktif |
| `ESP32-GAMMA-003` | `bpm-sample-gamma-key-003` | Ruang Perawatan 2 | Nonaktif |

**Menambahkan perangkat baru:** gunakan menu **Perangkat → Tambah** di dashboard, atau `POST /api/v1/devices`. Sistem akan menghasilkan API key acak (`bpm-...`) dan menampilkannya **hanya sekali**.

**Firmware ESP8266:** lihat [Dokumentasi Firmware](firmware.md).

---

## Troubleshooting

### Error: `DATABASE_URL` tidak ditemukan
Pastikan file `backend/.env` ada dan berisi `DATABASE_URL`. Jika tidak, salin dari `.env.example` atau buat manual.

### Error: `JWT_SECRET` kurang dari 64 karakter
Ganti `JWT_SECRET` di `backend/.env` dengan string minimal 64 karakter.

### Error: Port sudah digunakan (`EADDRINUSE`)
```bash
netstat -ano | findstr :5000     # Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```
Atau ubah `PORT` di `backend/.env`.

### Error: `PrismaClient is not a constructor`
```bash
cd backend
npx prisma generate
```

### Database error saat `db push` / `db:seed`
```bash
# Reset database (hapus + buat ulang + seed)
cd backend
npm run db:reset
```

### CORS error di browser
Pastikan `CORS_ORIGIN` di `backend/.env` sesuai URL frontend (`http://localhost:5173`). Untuk beberapa origin, gunakan `CORS_ORIGINS` (dipisah koma/spasi).

### Data real-time tidak muncul
1. Pastikan backend berjalan dan `http://localhost:5000/api/health` merespons.
2. Pastikan `VITE_SOCKET_URL` di `frontend/.env` benar.
3. Pastikan device terdaftar aktif dan sesi monitoring telah dimulai.
4. Cek browser console untuk error WebSocket.

### Device mengirim data tetapi tidak tercatat ke pasien
Pastikan sesi monitoring **ACTIVE** untuk device tersebut (mulai dari halaman Monitoring). Reading akan otomatis dikaitkan ke pasien dari sesi.

---

## Perintah Cepat

### Backend
```bash
cd backend
npm run dev          # jalankan development server
npm run build        # compile TypeScript → dist/
npm start            # jalankan production dari dist/
npm run db:generate  # generate Prisma client
npm run db:push      # push schema ke database
npm run db:seed      # seed data contoh
npm run db:reset     # reset database + seed
npm run db:studio    # GUI database (localhost:5555)
npm run lint         # lint backend
npm test             # jalankan test backend
```

### Frontend
```bash
cd frontend
npm run dev          # development server (localhost:5173)
npm run build        # build production (tsc + vite build)
npm run preview      # preview build production
npm run lint         # lint (oxlint)
npm test             # jalankan test frontend
```

### Root
```bash
npm run dev              # backend + frontend sekaligus
npm run build            # build keduanya
npm run lint             # lint keduanya
npm test                 # test keduanya
npm run docker:up        # jalankan docker compose
npm run docker:down      # stop docker compose
```
