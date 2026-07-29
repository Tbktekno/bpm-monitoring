# BPM & SpO₂ Monitoring Dashboard

**Dashboard Monitoring Detak Jantung (BPM) dan Saturasi Oksigen (SpO₂) — Real-Time**

Aplikasi berbasis web untuk memantau denyut jantung (BPM) dan saturasi oksigen (SpO₂) pasien secara real-time. Data vital signs dikirimkan oleh perangkat ESP32 melalui koneksi Socket.IO, diproses oleh backend Express, dan ditampilkan dalam dashboard interaktif berbasis React.

Sistem ini dirancang untuk digunakan di fasilitas kesehatan seperti rumah sakit, puskesmas, dan klinik untuk observasi pasien secara terus-menerus (continuous monitoring).

---

## Fitur Utama

- **Pemantauan Real-Time** — Data BPM dan SpO₂ dari perangkat ESP32 diterima dan ditampilkan secara langsung melalui koneksi Socket.IO.
- **Dashboard Interaktif** — Ringkasan statistik agregat, grafik perkembangan harian, distribusi status pasien (Normal / Waspada / Darurat).
- **Manajemen Pasien** — CRUD lengkap untuk data pasien dengan validasi, pencarian, dan pagination.
- **Riwayat Pemeriksaan** — Histori pembacaan vital sign dengan filter tanggal, status, dan pasien.
- **Sesi Monitoring** — Setiap pasien memiliki sesi monitoring aktif/riwayat dengan kumpulan pembacaan.
- **Sistem Peringatan (Alert)** — Notifikasi real-time ketika BPM atau SpO₂ melampaui ambang batas yang telah ditentukan.
- **Laporan Harian & Bulanan** — Agregasi data per hari/bulan dengan ringkasan statistik.
- **Ekspor PDF & Excel** — Unduh laporan dalam format PDF atau Excel untuk dokumentasi.
- **Manajemen Pengaturan** — Konfigurasi ambang batas BPM, SpO₂, interval monitoring, dan timeout sesi.
- **Autentikasi JWT** — Sistem login aman dengan token JWT (HS256) dan blacklist token.
- **gRPC Services** — Lapisan service terdefinisi dengan protobuf untuk komunikasi antar-service.
- **Audit Trail** — Semua aktivitas admin tercatat dalam log audit.
- **Perangkat ESP32** — Dukungan multiple device dengan autentikasi API key.

---

## Diagram Arsitektur

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        BPM & SpO₂ Monitoring Dashboard                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────────────┐  │
│  │   Browser     │    │   React SPA     │    │   Socket.IO Client     │  │
│  │  (Frontend)   │───▶│  Vite + TS      │◀───│  (socket.io-client)   │  │
│  │  localhost:5173│   │  Tailwind CSS   │    │                        │  │
│  └──────┬───────┘    └────────┬────────┘    └───────────┬────────────┘  │
│         │                     │                          │               │
│         │  REST API           │  Axios HTTP              │ Socket.IO     │
│         │  /api/v1/*          │  JWT Bearer              │ Events        │
│         ▼                     ▼                          ▼               │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   Backend (Express + Socket.IO)                    │  │
│  │                   localhost:5000                                   │  │
│  │                                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │  Auth    │  │Dashboard │  │ Patients │  │   Monitoring     │  │  │
│  │  │ Module   │  │ Module   │  │ Module   │  │   Module         │  │  │
│  │  ├──────────┤  ├──────────┤  ├──────────┤  ├──────────────────┤  │  │
│  │  │ Settings │  │ Reports  │  │  Middle- │  │   Socket.IO      │  │  │
│  │  │ Module   │  │ Module   │  │  ware    │  │   Handler        │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │           gRPC Client (optional)                          │   │  │
│  │  └─────────────────────┬──────────────────────────────────────┘   │  │
│  └────────────────────────┼──────────────────────────────────────────┘  │
│                           │                                             │
│                    ┌──────▼──────┐                                      │
│                    │  Prisma ORM │                                      │
│                    │  (SQLite/   │                                      │
│                    │  PostgreSQL)│                                      │
│                    └──────┬──────┘                                      │
│                           │                                             │
│                    ┌──────▼──────┐   ┌──────────────────┐              │
│                    │  Database   │   │  ESP32 Device    │              │
│                    │  (dev.db)   │   │  MAX30100 Sensor │              │
│                    └─────────────┘   │  Socket.IO emit  │              │
│                                       │  esp32:reading   │              │
│                                       └──────────────────┘              │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Lapisan        | Teknologi                          |
|----------------|------------------------------------|
| **Frontend**   | React 19, TypeScript 6, Vite 8     |
| **Styling**    | Tailwind CSS 3, Framer Motion      |
| **State**      | TanStack React Query, React Context |
| **Routing**    | React Router DOM 7                 |
| **Backend**    | Node.js, Express 5, TypeScript 5   |
| **ORM**        | Prisma 5                           |
| **Database**   | SQLite (dev) / PostgreSQL (prod)   |
| **Real-Time**  | Socket.IO 4                        |
| **Auth**       | JWT (jsonwebtoken), bcryptjs       |
| **API Proto**  | gRPC (protobuf)                    |
| **Laporan**    | PDFKit, ExcelJS                    |
| **Logging**    | Winston                            |
| **Keamanan**   | Helmet, CORS, express-rate-limit   |
| **Chart**      | Recharts                           |
| **Form**       | React Hook Form + Zod              |
| **Notifikasi** | Sonner                             |

---

## Prasyarat

- **Node.js** — versi 22 atau lebih baru
- **pnpm** — package manager (disarankan) atau npm
- **Git** — untuk cloning repository

---

## Panduan Memulai Cepat

### 1. Clone Repository

```bash
git clone <repository-url>
cd Health
```

### 2. Setup Backend

```bash
cd backend
npm install

# Buat file .env (sudah tersedia untuk development)
# Sesuaikan jika diperlukan

# Generate Prisma Client dan push schema ke database
npx prisma generate
npx prisma db push

# Seed database dengan data contoh
npm run db:seed

# Jalankan development server
npm run dev
```

Backend akan berjalan di `http://localhost:5000`.

### 3. Setup Frontend

Buka terminal baru:

```bash
cd frontend
npm install

# Jalankan development server
npm run dev
```

Frontend akan berjalan di `http://localhost:5173`.

### 4. Akses Aplikasi

Buka browser dan akses: **http://localhost:5173**

**Kredensial Default:**

| Field    | Value                          |
|----------|--------------------------------|
| Email    | `admin@monitoring-bpm.web.id`  |
| Password | `Admin123!`                    |

> **Peringatan:** Ganti password default segera setelah deploy ke production.

---

## Skrip Referensi

### Backend (`backend/package.json`)

| Skrip           | Deskripsi                                      |
|-----------------|------------------------------------------------|
| `npm run dev`   | Jalankan development server (ts-node-dev)      |
| `npm run build` | Compile TypeScript ke JavaScript               |
| `npm start`     | Jalankan production server dari `dist/`        |
| `npm run db:generate` | Generate Prisma Client                   |
| `npm run db:push` | Push schema ke database                     |
| `npm run db:seed` | Seed database dengan data contoh           |
| `npm run db:studio` | Buka Prisma Studio (GUI database)        |
| `npm run db:reset` | Reset database + seed                     |

### Frontend (`frontend/package.json`)

| Skrip               | Deskripsi                                   |
|---------------------|---------------------------------------------|
| `npm run dev`       | Jalankan Vite development server            |
| `npm run build`     | Build untuk production (tsc + vite build)   |
| `npm run preview`   | Preview production build lokal              |
| `npm run lint`      | Jalankan oxlint untuk static analysis       |

---

## Struktur Proyek

```
I:\Health\
├── README.md
├── docs/
│   ├── api.md
│   ├── setup.md
│   ├── architecture.md
│   └── deployment.md
│
├── backend/
│   ├── .env                      # Environment variables
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Database schema (7 models)
│   │   ├── seed.ts               # Data contoh
│   │   └── dev.db                # SQLite database (development)
│   ├── proto/
│   │   ├── health.proto          # Protobuf definisi (health)
│   │   └── monitoring.proto      # Protobuf definisi (monitoring)
│   ├── logs/                     # Log files (Winston)
│   └── src/
│       ├── index.ts              # Entry point
│       ├── config/
│       │   ├── database.ts       # Prisma client singleton
│       │   ├── env.ts            # Validasi environment
│       │   └── security.ts       # CORS, Helmet, Rate Limit
│       ├── server/
│       │   ├── index.ts          # Express + Socket.IO setup
│       │   └── middleware/
│       │       ├── auth.ts       # JWT authentication
│       │       ├── error-handler.ts  # Global error handler
│       │       └── request-logger.ts # Winston logger
│       ├── shared/
│       │   ├── app-error.ts      # Custom error classes
│       │   ├── jwt.ts            # JWT utilities
│       │   ├── status-calculator.ts  # BPM/SpO2 threshold logic
│       │   ├── types.ts          # Shared type definitions
│       │   └── esp32-auth-middleware.ts # ESP32 Socket auth
│       ├── modules/
│       │   ├── auth/             # Login, Logout, Me
│       │   ├── dashboard/        # Aggregated stats
│       │   ├── patients/         # CRUD pasien
│       │   ├── monitoring/       # Real-time + history
│       │   ├── reports/          # Laporan + export
│       │   └── settings/         # Konfigurasi threshold
│       ├── socket/
│       │   └── handler.ts        # Socket.IO event handlers
│       └── grpc/
│           ├── client.ts         # gRPC client factory
│           ├── server.ts         # gRPC server setup
│           └── handlers/         # gRPC handler implementations
│
└── frontend/
    ├── .env                      # Environment variables
    ├── package.json
    ├── vite.config.ts            # Vite configuration + proxy
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── main.tsx              # Entry point
        ├── App.tsx               # Root component + routing
        ├── index.css             # Global styles
        ├── constants/
        │   └── index.ts          # Constants (thresholds, colors, etc.)
        ├── contexts/
        │   └── AuthContext.tsx    # Authentication context
        ├── types/
        │   └── index.ts          # TypeScript interfaces
        ├── services/
        │   ├── api.ts            # Axios instance + interceptors
        │   ├── auth.service.ts   # Auth API calls
        │   ├── dashboard.service.ts
        │   ├── patients.service.ts
        │   ├── monitoring.service.ts
        │   ├── reports.service.ts
        │   └── settings.service.ts
        │   └── socket.service.ts # Socket.IO client
        ├── hooks/
        │   ├── useAuth.ts
        │   ├── useDashboard.ts
        │   ├── usePatients.ts
        │   ├── useMonitoring.ts
        │   ├── useSocket.ts
        │   └── usePagination.ts
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx
        │   ├── Monitoring.tsx
        │   ├── MonitoringDetail.tsx
        │   ├── PatientList.tsx
        │   ├── PatientCreate.tsx
        │   ├── PatientDetail.tsx
        │   ├── PatientEdit.tsx
        │   ├── History.tsx
        │   ├── Reports.tsx
        │   └── Settings.tsx
        ├── layouts/
        │   └── AppLayout.tsx     # Main layout (sidebar + header)
        └── components/
            └── ui/               # UI components
```

---

## Variabel Environment

### Backend (`backend/.env`)

| Variabel              | Default                        | Deskripsi                                    |
|-----------------------|--------------------------------|----------------------------------------------|
| `DATABASE_URL`        | `file:./dev.db`                | URL koneksi database (SQLite/PostgreSQL)     |
| `PORT`                | `5000`                         | Port HTTP server                             |
| `NODE_ENV`            | `development`                  | Environment mode                             |
| `JWT_SECRET`          | *(min 64 karakter)*            | Secret key untuk JWT signing                 |
| `JWT_ISSUER`          | `bpm-monitoring`               | Issuer JWT token                             |
| `JWT_EXPIRES_IN`      | `24h`                          | Masa berlaku token (default)                 |
| `JWT_REMEMBER_EXPIRES_IN` | `7d`                      | Masa berlaku token (remember me)             |
| `GRPC_HOST`           | `localhost`                    | Host gRPC server                             |
| `GRPC_PORT`           | `50051`                        | Port gRPC server                             |
| `CORS_ORIGIN`         | `http://localhost:5173`        | Origin yang diizinkan CORS                   |
| `CORS_ORIGINS`        | *(optional)*                   | Daftar origin (dipisah koma/spasi)           |
| `RATE_LIMIT_GLOBAL_MAX`  | `200`                      | Global rate limit per 15 menit               |
| `RATE_LIMIT_AUTH_MAX`    | `10`                       | Auth rate limit per 15 menit                 |
| `RATE_LIMIT_ESP32_MAX`   | `60`                       | ESP32 rate limit per 1 menit                 |

### Frontend (`frontend/.env`)

| Variabel              | Default                        | Deskripsi                                    |
|-----------------------|--------------------------------|----------------------------------------------|
| `VITE_API_BASE_URL`  | `http://localhost:5000/api/v1` | Base URL untuk REST API                      |
| `VITE_SOCKET_URL`    | `http://localhost:5000`         | URL untuk koneksi Socket.IO                  |

---

## Deployment dengan Docker

```bash
# Build images
docker build -t bpm-backend ./backend
docker build -t bpm-frontend ./frontend

# Atau menggunakan Docker Compose (contoh)
docker-compose up -d
```

Lihat **[Panduan Deployment](docs/deployment.md)** untuk instruksi lengkap.

---

## Lisensi

Hak Cipta © 2026. Seluruh hak cipta dilindungi undang-undang.

---

## Kontak

Untuk pertanyaan atau dukungan teknis, silakan hubungi tim pengembangan.
