# Panduan Arsitektur — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan arsitektur sistem secara menyeluruh: desain modul, alur data, keamanan, real-time, gRPC, dan komponen backend.

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Diagram Konteks (C4 Level 1)](#diagram-konteks-c4-level-1)
- [Diagram Container (C4 Level 2)](#diagram-container-c4-level-2)
- [Struktur Backend](#struktur-backend)
- [Middleware Pipeline](#middleware-pipeline)
- [Alur Ingestion Data IoT](#alur-ingestion-data-iot)
- [Alur Sesi Monitoring](#alur-sesi-monitoring)
- [Arsitektur Modul](#arsitektur-modul)
- [Shared Layer](#shared-layer)
- [Arsitektur Socket.IO](#arsitektur-socketio)
- [Arsitektur gRPC](#arsitektur-grpc)
- [Discovery: mDNS & UDP](#discovery-mdns--udp)
- [Logging](#logging)
- [Pola Desain & Konvensi](#pola-desain--konvensi)

---

## Gambaran Umum

Sistem BPM & SpO₂ Monitoring Dashboard adalah aplikasi **client-server** untuk pemantauan vital sign real-time:

- **IoT Devices (ESP8266/ESP32 + MAX30100)** — membaca BPM & SpO₂, mengirim via HTTP POST.
- **Backend (Express + TypeScript)** — REST API, Socket.IO, gRPC, Prisma ORM.
- **Frontend (React SPA)** — dashboard admin real-time.
- **Database** — SQLite (dev) / PostgreSQL (prod).

### Prinsip Arsitektur

1. **Separation of Concerns** — setiap modul memiliki tanggung jawab jelas.
2. **Real-Time First** — data vital sign diproses & disebarkan real-time.
3. **Security by Design** — JWT untuk admin, API key untuk device, validasi input.
4. **Observability** — logging Winston + audit trail.
5. **Database Abstraction** — Prisma ORM.

---

## Diagram Konteks (C4 Level 1)

```
┌───────────────────────────────────────────────────────────────────────┐
│                        BPM & SpO₂ Monitoring                           │
│                                                                        │
│   ┌──────────────┐   ┌─────────────────┐   ┌─────────────────────┐    │
│   │    Admin      │   │  ESP8266/ESP32  │   │  ESP32 Devices      │    │
│   │  (Petugas)    │   │  + MAX30100     │   │  (multi-device)     │    │
│   │  via Browser  │   │  (satu device)  │   │                     │    │
│   └──────┬────────┘   └────────┬────────┘   └──────────┬──────────┘    │
│          │                     │                        │               │
│          │  HTTP + WS          │  HTTP POST             │  HTTP POST    │
│          ▼                     ▼                        ▼               │
│   ┌─────────────────────────────────────────────────────────────┐      │
│   │                  BPM & SpO₂ Monitoring Dashboard             │      │
│   │              (Backend Express + Socket.IO + gRPC)            │      │
│   └───────────────────────────┬─────────────────────────────────┘      │
│                               │                                        │
│                        ┌──────▼──────┐                                 │
│                        │  Database   │                                 │
│                        │ (SQLite /   │                                 │
│                        │ PostgreSQL) │                                 │
│                        └─────────────┘                                 │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Diagram Container (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BPM & SpO₂ Monitoring Dashboard                     │
│                                                                          │
│  ┌──────────────────────────┐        ┌────────────────────────────────┐ │
│  │  Single Page App (React) │        │  Node.js Backend (Express 5)   │ │
│  │  Port: 5173              │        │  Port: 5000 (HTTP+WS)          │ │
│  │                          │        │  Port: 50051 (gRPC)            │ │
│  │  Pages:                  │        │                                │ │
│  │  • Login, Dashboard      │        │  Modules:                      │ │
│  │  • Monitoring (+Detail)  │        │  • Auth                       │ │
│  │  • Pasien (List/Detail/  │        │  • Dashboard                  │ │
│  │    Create/Edit)          │        │  • Patients                   │ │
│  │  • Laporan               │        │  • Monitoring (sessions)      │ │
│  │  • Perangkat, Pengaturan │        │  • Readings (ingestion)       │ │
│  │                          │        │  • Reports (PDF)              │ │
│  │  Services (Axios +       │        │  • Settings                   │ │
│  │  socket.io-client)       │        │  • Devices                    │ │
│  └───────────┬──────────────┘        │                                │ │
│              │ REST /api/v1/*        │  Middleware:                  │ │
│              │ Socket.IO events      │  • JWT Auth, Helmet, CORS     │ │
│              ▼                       │  • Rate Limiting, Request Log │ │
│                                      │  • Global Error Handler       │ │
│                                      │                                │ │
│                                      │  Shared:                      │ │
│                                      │  • status-calculator.ts       │ │
│                                      │  • jwt.ts (blacklist)         │ │
│                                      │  • app-error.ts               │ │
│                                      │  • esp32-auth (socket+http)   │ │
│                                      │  • mdns-advertiser, udp disc  │ │
│                                      │  • grpc-auth                  │ │
│                                      │                                │ │
│                                      │  gRPC Server (opsional):      │ │
│                                      │  Auth/Dashboard/Patient/      │ │
│                                      │  Monitoring/Report/Settings   │ │
│                                      └──────────────┬─────────────────┘ │
│                                                     │                   │
│                                                     ▼                   │
│                                      ┌──────────────────────────────┐   │
│                                      │  Prisma ORM → Database       │   │
│                                      │  7 models (lihat database.md)│   │
│                                      └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Struktur Backend

```
backend/
├── prisma/
│   ├── schema.prisma          # Definisi 7 model database
│   ├── seed.ts                # Data contoh (admin, pasien, sesi, dsb.)
│   └── dev.db                 # SQLite (development)
├── proto/
│   ├── health.proto           # Definsi protobuf health
│   └── monitoring.proto       # Definisi protobuf layanan inti
├── src/
│   ├── index.ts               # Entry point (start server + mDNS)
│   ├── config/
│   │   ├── env.ts             # Validasi environment variables
│   │   ├── database.ts        # Prisma client singleton
│   │   └── security.ts        # CORS, Helmet, Rate Limit config
│   ├── server/
│   │   ├── index.ts           # Express + Socket.IO setup
│   │   └── middleware/
│   │       ├── auth.ts        # JWT auth middleware (admin)
│   │       ├── error-handler.ts
│   │       └── request-logger.ts  # Winston logger
│   ├── shared/
│   │   ├── app-error.ts       # Error classes (AppError, NotFound, dsb.)
│   │   ├── jwt.ts             # JWT utilities + blacklist
│   │   ├── status-calculator.ts   # Logika threshold BPM/SpO₂
│   │   ├── types.ts           # Tipe bersama
│   │   ├── auth-middleware.ts
│   │   ├── grpc-auth.ts
│   │   ├── esp32-auth-middleware.ts  # Auth Socket.IO device
│   │   ├── esp32-http-auth.ts        # Auth HTTP device (headers)
│   │   ├── mdns-advertiser.ts        # Publikasi mDNS bpm-server.local
│   │   └── udp-discovery.ts          # UDP broadcast discovery (port 5500)
│   ├── socket/
│   │   └── handler.ts         # Event Socket.IO admin-facing
│   ├── grpc/
│   │   ├── client.ts          # Factory gRPC client
│   │   ├── server.ts          # Setup gRPC server
│   │   └── handlers/          # Implementasi handler gRPC
│   │       ├── auth-handler.ts
│   │       ├── dashboard-handler.ts
│   │       ├── patient-handler.ts
│   │       ├── monitoring-handler.ts
│   │       ├── report-handler.ts
│   │       └── settings-handler.ts
│   └── modules/
│       ├── auth/              # login, logout, me
│       ├── dashboard/         # statistik agregat
│       ├── patients/          # CRUD pasien
│       ├── monitoring/        # sesi + riwayat
│       ├── readings/          # ingestion data device
│       ├── reports/           # laporan + ekspor PDF
│       ├── settings/          # pengaturan, profil, password
│       └── devices/           # CRUD perangkat ESP32
└── ...
```

---

## Middleware Pipeline

Setiap permintaan HTTP melewati pipeline berikut (dari `server/index.ts`):

```
Request Masuk
    │
    ▼
┌────────────────────┐
│ Helmet             │  → Security headers (di server/index.ts)
└────────┬───────────┘
         ▼
┌────────────────────┐
│ CORS               │  → corsOptions (config/security.ts)
└────────┬───────────┘
         ▼
┌────────────────────┐
│ express.json()     │  → Body parsing (limit 1mb)
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Request Logger     │  → Winston — DIPASANG SEBELUM rate limiter supaya
│ (request-logger)   │    request yang ditolak 429 tetap tercatat
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Global Rate Limit  │  → 200 req / 15 menit untuk /api/
│                    │    (skip: /api/v1/readings → limiter khusus)
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Auth Rate Limit    │  → 10 req / 15 menit untuk /api/v1/auth/login
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Route Modules      │  → /api/v1/{auth,dashboard,patients,monitoring,
│                     │    reports,settings,devices,readings}
└────────┬───────────┘
         ▼
┌────────────────────┐
│ ESP32 HTTP Auth    │  → Khusus POST /api/v1/readings/device
│ (esp32-http-auth)  │    (x-api-key + x-device-id)
└────────┬───────────┘
         ▼
┌────────────────────┐
│ JWT Auth           │  → authenticate() untuk semua route admin
│ (auth.ts)          │
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Route Handler      │  → Controller logic
└────────┬───────────┘
         ▼
┌────────────────────┐
│ Error Handler      │  → globalErrorHandler
└────────────────────┘
```

> **Rate limit ingestion:** endpoint `/api/v1/readings/device` dikecualikan dari global limiter dan memakai `esp32RateLimit` (60 request/menit) yang dipasang langsung di `readings.routes.ts`.

---

## Alur Ingestion Data IoT

Perangkat ESP8266 mengirim data vital sign melalui **HTTP POST** (bukan Socket.IO).

```
ESP8266 (MAX30100)                     Backend                          Database
      │                                  │                                 │
      │  1. Baca sensor BPM & SpO₂       │                                 │
      │─────────────────────────────────▶│                                 │
      │                                  │                                 │
      │  2. POST /api/v1/readings/device │                                 │
      │     Headers:                     │                                 │
      │       x-api-key: <api key>       │                                 │
      │       x-device-id: ESP32-...     │                                 │
      │     Body: { bpm, spo2 }          │                                 │
      │─────────────────────────────────▶│                                 │
      │                                  │  3. esp32HttpAuth:              │
      │                                  │     hash SHA-256 api key        │
      │                                  │     cari Esp32Device (aktif)    │
      │                                  │                                 │
      │                                  │  4. Validasi body               │
      │                                  │     bpm: 30–250                 │
      │                                  │     spo2: 50–100                │
      │                                  │                                 │
      │                                  │  5. Cari sesi ACTIVE device tsb │
      │                                  │────────────────────────────────▶│
      │                                  │  6. Hitung status               │
      │                                  │     (status-calculator.ts)      │
      │                                  │                                 │
      │                                  │  7. INSERT Reading              │
      │                                  │────────────────────────────────▶│
      │                                  │                                 │
      │  8. HTTP 201 { readingId,status}│                                 │
      │◀─────────────────────────────────│                                 │
      │                                  │                                 │
      │                                  │  9. Broadcast (Socket.IO):      │
      │                                  │     monitoring:update           │
      │                                  │     → room 'admins'             │
      │                                  │     monitoring:alert (jika      │
      │                                  │     threshold violation)        │
      │                                  │────────────────────────────────▶│
      │                                  │     (dashboard admin)           │
```

**Catatan penting:**
- Threshold cache di-load dari tabel `Setting` dan disegarkan setiap **5 menit**.
- Jika tidak ada sesi ACTIVE untuk device, reading tetap disimpan dengan `sessionId: null`.
- `patientId` diambil dari sesi aktif (bukan dari body request).
- Body dinormalisasi otomatis: JSON ganda (string ter-escape), `Content-Type` salah (form-urlencoded), dan nilai string numerik/float (`"75"`, `75.4`) di-parse & dibulatkan sebelum validasi.
- Endpoint `/api/v1/readings/device` memakai rate limit khusus (`esp32RateLimit`, 60/menit) dan dikecualikan dari global limiter.

---

## Alur Sesi Monitoring

### Memulai Sesi
```
Admin → POST /api/v1/monitoring/session/start { patientId, deviceId }
  1. Validasi patientId wajib
  2. Jika deviceId diberikan: validasi device terdaftar & aktif di Esp32Device
     (tidak terdaftar → 400, mencegah sesi memakai Device ID lama)
  3. Cek apakah device sudah punya sesi ACTIVE (409 jika ya)
  4. Validasi pasien ada
  5. Buat MonitoringSession (status: ACTIVE, deviceId: ...)
  6. Respond 201 dengan data sesi
```

### Mengakhiri Sesi
```
Admin → POST /api/v1/monitoring/session/stop { sessionId | deviceId }
  1. Cari sesi (by sessionId atau by deviceId+ACTIVE)
  2. Update status → COMPLETED, endTime = now
  3. Backfill patientId ke readings di sesi tsb yang masih null
  4. Respond dengan sesi + _count.readings
```

### Kaitkan Reading ke Sesi
Saat device mengirim reading, backend mencari `MonitoringSession` dengan `deviceId = device.deviceId && status = ACTIVE`. Jika ditemukan, reading dikaitkan (`sessionId`, `patientId`).

> ⚠ **Rename device:** `updateDevice` (devices.controller.ts) otomatis menyinkronkan `deviceId` lama → baru pada semua sesi via `prisma.monitoringSession.updateMany`. Ini menjaga data tetap tercatat (sesi aktif tetap terhubung, laporan menampilkan id terbaru) ketika Device ID diganti di dashboard.

---

## Arsitektur Modul

Setiap modul mengikuti pola **Routes + Controller** dengan Prisma sebagai data access.

```
modules/
├── auth/               # Autentikasi admin
│   ├── auth.routes.ts
│   └── auth.controller.ts
├── dashboard/          # Statistik dashboard
│   ├── dashboard.routes.ts
│   └── dashboard.controller.ts
├── patients/           # CRUD pasien
│   ├── patients.routes.ts
│   └── patients.controller.ts
├── monitoring/         # Sesi monitoring + riwayat
│   ├── monitoring.routes.ts
│   └── monitoring.controller.ts
├── readings/           # Ingestion data device (HTTP)
│   ├── readings.routes.ts
│   └── readings.controller.ts
├── reports/            # Laporan + ekspor
│   ├── reports.routes.ts
│   └── reports.controller.ts
├── settings/           # Pengaturan & admin profile
│   ├── settings.routes.ts
│   └── settings.controller.ts
└── devices/            # CRUD perangkat ESP32
    ├── devices.routes.ts
    └── devices.controller.ts
```

### Pola Per Modul

```
┌──────────────────────────────┐
│ Routes                       │
│ • Definisikan endpoint HTTP  │
│ • Attach middleware          │
│ • Delegasikan ke controller  │
├──────────────────────────────┤
│ Controller                   │
│ • Handling request/response  │
│ • Validasi input             │
│ • Business logic             │
│ • Panggil Prisma ORM         │
│ • Logging + audit log        │
├──────────────────────────────┤
│ Prisma ORM (shared)          │
│ • Query database             │
│ • Transaction                │
├──────────────────────────────┤
│ Database                     │
│ • SQLite (dev)               │
│ • PostgreSQL (prod)          │
└──────────────────────────────┘
```

---

## Shared Layer

| File | Fungsi |
|------|--------|
| `shared/app-error.ts` | `AppError` (base), `NotFoundError` (404), `UnauthorizedError` (401), `ForbiddenError` (403), `ValidationError` (400), `ConflictError` (409) |
| `shared/jwt.ts` | `generateAccessToken`, `generateTokenPair`, `verifyToken`, `blacklistToken`, `isTokenBlacklisted` |
| `shared/status-calculator.ts` | `calculateBpmStatus`, `calculateSpo2Status`, `calculateCompositeStatus`, `calculateDiseaseClassification`, `calculateStatuses` |
| `shared/types.ts` | Tipe bersama (BpmStatus, Spo2Status, CompositeStatus, VitalSignsInput, dsb.) |
| `shared/esp32-http-auth.ts` | Auth device via header HTTP (`x-device-id`, `x-api-key`) |
| `shared/esp32-auth-middleware.ts` | Auth device pada handshake Socket.IO |
| `shared/auth-middleware.ts` | Helper autentikasi admin |
| `shared/grpc-auth.ts` | Autentikasi pada gRPC |
| `shared/mdns-advertiser.ts` | Publikasi `bpm-server.local` + service `_bpm-monitor._tcp` |
| `shared/udp-discovery.ts` | UDP broadcast discovery (port 5500) |

---

## Arsitektur Socket.IO

### Koneksi & Autentikasi

```
Socket.IO Server (namespace default)
│
├── Admin Clients (JWT token via auth/query)
│   ├── join room "admins"
│   └── subscribe:patient → join room "patient:{id}"
│
└── ESP32 Devices (apiKey via auth/query)  ← untuk koneksi WebSocket (legacy)
    └── Di backend versi sekarang, data device dikirim via HTTP
```

Alur auth socket (`esp32-auth-middleware.ts`):
1. Jika koneksi membawa JWT token valid → dianggap admin, `next()`.
2. Jika tidak, cek `apiKey` → hash SHA-256 → cocokkan dengan `Esp32Device`.
3. Jika keduanya gagal → tolak koneksi.

### Event

| Event | Arah | Trigger | Penerima |
|-------|------|---------|----------|
| `monitoring:update` | Server → Admin | Reading baru disimpan | room `admins` |
| `monitoring:alert` | Server → Admin | Threshold violation | room `admins` |
| `subscribe:patient` | Admin → Server | Subscribe pasien | Server |
| `unsubscribe:patient` | Admin → Server | Unsubscribe pasien | Server |
| `subscribed` / `unsubscribed` | Server → Admin | Konfirmasi | Client |
| `disconnect` | - | Client putus | Server |

Detail lengkap: lihat [Socket.IO / Real-Time](socketio.md).

---

## Arsitektur gRPC

Backend menyediakan layanan gRPC opsional (di `backend/proto/monitoring.proto` & `health.proto`):

| Service | Methods |
|---------|---------|
| `AuthService` | `Login`, `Logout`, `GetCurrentAdmin` |
| `DashboardService` | `GetDashboardStats` |
| `PatientService` | `ListPatients`, `GetPatient`, `CreatePatient`, `UpdatePatient`, `DeletePatient` |
| `MonitoringService` | `GetRealtimeMonitoring`, `GetMonitoringHistory`, `SaveReading` |
| `ReportService` | `GetDailyReport`, `GetMonthlyReport`, `ExportReport` |
| `SettingsService` | `GetSettings`, `UpdateSettings` |

```
Express Controller
    │
    ├──→ (Prisma langsung) → Database     [Jalur default]
    │
    └──→ gRPC Client → gRPC Server → Prisma → Database  [Opsional]
          gRPC Server: port 50051
```

- **Client**: `src/grpc/client.ts`
- **Server**: `src/grpc/server.ts`
- **Handlers**: `src/grpc/handlers/*.ts`

---

## Discovery: mDNS & UDP

### mDNS Advertiser
- Backend mempublikasikan dirinya sebagai host `bpm-server.local` dan service `_bpm-monitor._tcp` (port `env.port`).
- ESP8266 dapat menemukan backend tanpa konfigurasi IP manual.
- Dijalankan saat server start (`index.ts` → `startMdnsAdvertising()`).
- Memerlukan paket `bonjour-service`.

### UDP Discovery (opsional)
- Backend mendengarkan UDP broadcast di port `5500`.
- ESP8266 mengirim pesan `"BPM-DISCOVERY"` → backend merespons `{"type":"BPM-SERVER","host":...,"port":...}`.
- Belum aktif default di firmware (firmware memakai mDNS/DNS).

---

## Logging

### Winston Logger — Transport

```
Winston Logger
├── Console    → level debug (dev) / info (prod), colorized
├── File error → logs/error.log, max 5MB, max 5 files
└── File combined → logs/combined.log, max 5MB, max 10 files
```

### Yang Di-Log
- **HTTP requests** — method, URL, status, durasi
- **Database operations** — query (mode dev)
- **Socket events** — connect, disconnect, error
- **Autentikasi** — login/logout, ESP32 auth (sukses/gagal)
- **CRUD operations** — patient, device, settings
- **Ingestion** — reading tersimpan (`[READINGS] Data tersimpan`)

Contoh:
```
2026-08-06 10:30:00 [INFO] GET /api/v1/patients → 200 (45ms)
2026-08-06 10:30:00 [WARN] ESP32 HTTP auth rejected { deviceId, ip }
2026-08-06 10:30:01 [INFO] [READINGS] Data tersimpan { ... }
```

---

## Pola Desain & Konvensi

1. **Controller + Routes** — tanpa service layer terpisah; logika langsung di controller.
2. **AppError** — semua error operasional menggunakan `AppError` agar global handler bisa membedakan error yang diharapkan vs bug.
3. **Status calculator terpusat** — klasifikasi BPM/SpO₂/status/disease harus selalu melalui `shared/status-calculator.ts`.
4. **Audit log** — operasi CREATE/UPDATE/DELETE pada pasien, device, dan settings dicatat.
5. **Response format seragam** — `{ success, data, message, error? }`.
6. **Threshold cache** — dibaca dari DB, di-cache 5 menit, untuk performa.
7. **Token blacklist in-memory** — perlu Redis jika multi-instance.

---

## Lanjutkan Membaca

- [Overview](overview.md)
- [REST API](api.md)
- [Socket.IO / Real-Time](socketio.md)
- [Database](database.md)
- [Keamanan](security.md)
