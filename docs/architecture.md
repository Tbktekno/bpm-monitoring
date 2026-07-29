# Panduan Arsitektur — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan arsitektur sistem secara menyeluruh, termasuk desain modul, alur data, keamanan, dan database.

---

## Daftar Isi

- [Gambaran Umum Sistem](#gambaran-umum-sistem)
- [Diagram C4 — Level 1: Context](#diagram-c4--level-1-context)
- [Diagram C4 — Level 2: Container](#diagram-c4--level-2-container)
- [Alur Permintaan HTTP](#alur-permintaan-http)
- [Alur Data Real-Time](#alur-data-real-time)
- [Arsitektur Modul (Clean Architecture)](#arsitektur-modul-clean-architecture)
- [Database Schema](#database-schema)
- [Arsitektur Keamanan](#arsitektur-keamanan)
- [Arsitektur Socket.IO](#arsitektur-socketio)
- [Arsitektur gRPC](#arsitektur-grpc)
- [Logging](#logging)

---

## Gambaran Umum Sistem

Sistem BPM & SpO₂ Monitoring Dashboard adalah aplikasi **real-time monitoring** untuk memantau denyut jantung (BPM) dan saturasi oksigen (SpO₂) pasien. Sistem ini mengadopsi arsitektur **client-server** dengan komunikasi **REST API** untuk operasi CRUD dan **WebSocket (Socket.IO)** untuk data real-time.

### Prinsip Arsitektur

1. **Separation of Concerns** — Setiap modul memiliki tanggung jawab yang jelas
2. **Real-Time First** — Data vital sign diproses dan didistribusikan secara real-time
3. **Security by Design** — Autentikasi JWT, API key untuk ESP32, validasi input
4. **Observability** — Logging terstruktur dengan Winston, audit trail
5. **Database Abstraction** — Prisma ORM sebagai abstraksi database

---

## Diagram C4 — Level 1: Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BPM & SpO₂ Monitoring Dashboard                         │
│                                                                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────────────────┐ │
│  │   Admin      │  │     Dokter       │  │      Perawat                   │ │
│  │  (User)      │  │    (User)        │  │      (User)                    │ │
│  └──────┬───────┘  └────────┬─────────┘  └───────────────┬────────────────┘ │
│         │                  │                             │                  │
│         └──────────────────┼─────────────────────────────┘                  │
│                            │                                                │
│                   ┌────────▼────────┐                                      │
│                   │  BPM & SpO₂     │                                      │
│                   │  Monitoring     │                                      │
│                   │  Dashboard      │                                      │
│                   │  (System)       │                                      │
│                   └────────┬────────┘                                      │
│                            │                                                │
│                   ┌────────▼────────┐                                      │
│                   │  ESP32 Device   │                                      │
│                   │  (IoT Sensor)   │                                      │
│                   └─────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Diagram C4 — Level 2: Container

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            BPM & SpO₂ Monitoring Dashboard                       │
│                                                                                  │
│  ┌──────────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Single Page Application (React) │  │  Node.js Backend (Express 5)        │  │
│  │                                  │  │                                     │  │
│  │  ┌────────────────────────────┐  │  │  ┌───────────────────────────────┐  │  │
│  │  │  Pages:                    │  │  │  │  Modules:                    │  │  │
│  │  │  • Login                   │  │  │  │  • Auth Module               │  │  │
│  │  │  • Dashboard               │  │  │  │  • Dashboard Module          │  │  │
│  │  │  • Monitoring              │  │  │  │  • Patients Module           │  │  │
│  │  │  • Pasien (CRUD)           │  │  │  │  • Monitoring Module         │  │  │
│  │  │  • Riwayat                 │  │  │  │  • Reports Module            │  │  │
│  │  │  • Laporan                 │  │  │  │  • Settings Module           │  │  │
│  │  │  • Pengaturan              │  │  │  └───────────────────────────────┘  │  │
│  │  └────────────────────────────┘  │  │                                     │  │
│  │  ┌────────────────────────────┐  │  │  ┌───────────────────────────────┐  │  │
│  │  │  Services:                 │  │  │  │  Socket.IO Handler            │  │  │
│  │  │  • api.ts (Axios)          │──┼──┼──│  • esp32:reading             │  │  │
│  │  │  • socket.service.ts       │──┼──┼──│  • monitoring:update         │  │  │
│  │  │  • auth, dashboard, ...    │  │  │  │  • monitoring:alert          │  │  │
│  │  └────────────────────────────┘  │  │  └───────────────────────────────┘  │  │
│  │  ┌────────────────────────────┐  │  │                                     │  │
│  │  │  State:                    │  │  │  ┌───────────────────────────────┐  │  │
│  │  │  • React Query (server)    │  │  │  │  Middleware:                 │  │  │
│  │  │  • AuthContext (client)    │  │  │  │  • JWT Auth                 │  │  │
│  │  └────────────────────────────┘  │  │  │  • CORS + Helmet            │  │  │
│  │                                   │  │  │  • Rate Limiting            │  │  │
│  │  Port: 5173                      │  │  │  • Request Logger           │  │  │
│  │                                   │  │  │  • Global Error Handler    │  │  │
│  └──────────────────────────────────┘  │  └───────────────────────────────┘  │  │
│                                         │                                     │  │
│                                         │  ┌───────────────────────────────┐  │  │
│                                         │  │  gRPC Services (optional)     │  │  │
│                                         │  │  • AuthService               │  │  │
│                                         │  │  • DashboardService          │  │  │
│                                         │  │  • PatientService            │  │  │
│                                         │  │  • MonitoringService         │  │  │
│                                         │  │  • ReportService             │  │  │
│                                         │  │  • SettingsService           │  │  │
│                                         │  └───────────────────────────────┘  │  │
│                                         │                                     │  │
│                                         │  Port: 5000 (HTTP+WS)              │  │
│                                         │  Port: 50051 (gRPC)                │  │
│                                         └─────────────────────────────────────┘  │
│                                                    │                             │
│                                                    ▼                             │
│                                         ┌──────────────────────┐                │
│                                         │  Database (SQLite/   │                │
│                                         │  PostgreSQL)         │                │
│                                         │                      │                │
│                                         │  7 Models:           │                │
│                                         │  • Admin             │                │
│                                         │  • Patient           │                │
│                                         │  • Reading           │                │
│                                         │  • MonitoringSession │                │
│                                         │  • Setting           │                │
│                                         │  • Esp32Device       │                │
│                                         │  • AuditLog          │                │
│                                         └──────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Alur Permintaan HTTP

### Alur CRUD (Contoh: Membuat Pasien Baru)

```
Browser                          Frontend                          Backend                       Database
  │                                │                                │                              │
  │  1. Isi form pasien           │                                │                              │
  │──────────────────────────────▶│                                │                              │
  │                                │                                │                              │
  │                                │  2. POST /api/v1/patients      │                              │
  │                                │     Authorization: Bearer JWT  │                              │
  │                                │──────────────────────────────▶│                              │
  │                                │                                │                              │
  │                                │                                │  3. Verify JWT (auth.ts)     │
  │                                │                                │     • Decode token           │
  │                                │                                │     • Verify signature       │
  │                                │                                │     • Check admin exists     │
  │                                │                                │                              │
  │                                │                                │  4. Validate input           │
  │                                │                                │     • Name (min 2 chars)     │
  │                                │                                │     • Gender (L/P)           │
  │                                │                                │     • NIK (16 digits)        │
  │                                │                                │     • BloodType (A/B/AB/O)   │
  │                                │                                │     • Height (50-250)        │
  │                                │                                │     • Weight (2-300)         │
  │                                │                                │                              │
  │                                │                                │  5. INSERT INTO Patient     │
  │                                │                                │─────────────────────────────▶│
  │                                │                                │                              │
  │                                │                                │  6. INSERT INTO AuditLog    │
  │                                │                                │     (CREATE action)         │
  │                                │                                │─────────────────────────────▶│
  │                                │                                │                              │
  │                                │  7. Response 201              │                              │
  │                                │     { success, data, msg }    │                              │
  │                                │◀──────────────────────────────│                              │
  │                                │                                │                              │
  │  8. Tampilkan notifikasi       │                                │                              │
  │◀───────────────────────────────│                                │                              │
```

### Middleware Pipeline

Setiap permintaan HTTP melewati middleware pipeline berikut:

```
Request Masuk
    │
    ▼
┌──────────────┐
│   Helmet     │  → Security headers (CSP, HSTS, XSS, dll)
└──────┬───────┘
       ▼
┌──────────────┐
│   CORS       │  → Cross-Origin Resource Sharing
└──────┬───────┘
       ▼
┌──────────────┐
│   JSON Parser│  → Body parsing (1mb limit)
└──────┬───────┘
       ▼
┌──────────────┐
│Rate Limiter  │  → 200 req/15min global, 20 req/15min auth
└──────┬───────┘
       ▼
┌──────────────┐
│Req Logger    │  → Winston logging (method, url, status, duration)
└──────┬───────┘
       ▼
┌──────────────┐
│ JWT Auth     │  → Verify Bearer token (kecuali route publik)
└──────┬───────┘
       ▼
┌──────────────┐
│Route Handler │  → Controller logic
└──────┬───────┘
       ▼
┌──────────────┐
│Error Handler │  → Global error handling
└──────────────┘
```

---

## Alur Data Real-Time

### Dari ESP32 ke Semua Admin Client

```
  ┌──────────┐                          ┌───────────────────┐                    ┌──────────────┐
  │  ESP32   │                          │  Backend Server   │                    │  Admin Client │
  │ (Sensor) │                          │  (Socket.IO)      │                    │  (Dashboard)  │
  └────┬─────┘                          └─────────┬─────────┘                    └──────┬────────┘
       │                                         │                                      │
       │  Socket.IO Connection                    │                                      │
       │  auth: { deviceId, apiKey }              │                                      │
       │────────────────────────────────────────▶│                                      │
       │                                         │                                      │
       │  1. esp32:reading                       │                                      │
       │     { deviceId, apiKey,                  │                                      │
       │       patientId, bpm, spo2 }             │                                      │
       │────────────────────────────────────────▶│                                      │
       │                                         │                                      │
       │                                         │  2. Validasi Device                   │
       │                                         │     • Cari device by deviceId         │
       │                                         │     • Cek isActive                    │
       │                                         │     • Cocokkan apiKey                 │
       │                                         │     • Validasi range BPM (30-250)     │
       │                                         │     • Validasi range SpO₂ (50-100)    │
       │                                         │     • Validasi patientId              │
       │                                         │                                      │
       │                                         │  3. Hitung Status                    │
       │                                         │     • bpmStatus: BRADICARDIA /        │
       │                                         │       NORMAL / TACHY_RINGAN /        │
       │                                         │       TACHY_BERAT                    │
       │                                         │     • spo2Status: NORMAL /            │
       │                                         │       HIPOKSEMIA_*                    │
       │                                         │     • status: NORMAL / WASPADA /      │
       │                                         │       DARURAT                        │
       │                                         │                                      │
       │                                         │  4. Auto-create session if needed    │
       │                                         │     (cari sesi ACTIVE atau buat baru) │
       │                                         │                                      │
       │                                         │  5. Simpan Reading ke database        │
       │                                         │──────────────────────────────────    │
       │                                         │                                      │
       │  6. esp32:ack                           │                                      │
       │     { readingId, status }               │                                      │
       │◀────────────────────────────────────────│                                      │
       │                                         │                                      │
       │                                         │  7. monitoring:update                 │
       │                                         │     { type: 'new_reading',            │
       │                                         │       reading: {...} }                │
       │                                         │─────────────────────────────────────▶│
       │                                         │                                      │
       │                                         │  8. (Jika alert) monitoring:alert     │
       │                                         │     { patientId, patientName,         │
       │                                         │       reading, message, timestamp }   │
       │                                         │─────────────────────────────────────▶│
       │                                         │                                      │
       │                                         │  9. Update dashboard UI              │
       │                                         │     (real-time chart updates)         │
```

### Threshold Alert Logic

```
Pembacaan Baru (bpm, spo2)
       │
       ▼
┌────────────────┐
│ Cek Threshold  │─── BPM < min_bpm (60)? ──▶ Alert: "BPM di bawah batas normal"
│ Cache (5 menit)│─── BPM > max_bpm (100)? ──▶ Alert: "BPM di atas batas normal"
└────────────────┘─── SpO₂ < min_spo2 (95)? ──▶ Alert: "SpO₂ di bawah batas normal"
       │              ── Semua normal? ──▶ Tidak ada alert
       ▼
┌────────────────┐
│ Composite      │─── NORMAL (BPM normal + SpO₂ normal)
│ Status Check   │─── DARURAT (BRADICARDIA / TACHY_BERAT / HIPOKSEMIA_SEDANG+)
└────────────────┘─── WASPADA (sisanya)
       │
       ▼
Kirim monitoring:alert jika ada threshold violation ATAU status != NORMAL
```

---

## Arsitektur Modul (Clean Architecture)

Setiap modul di backend mengikuti pola **Controller + Routes** dengan Prisma sebagai data access layer.

### Struktur Modul

```
modules/
├── auth/              # Autentikasi
│   ├── auth.routes.ts     # Route definitions
│   └── auth.controller.ts # Business logic
├── dashboard/         # Statistik dashboard
│   ├── dashboard.routes.ts
│   └── dashboard.controller.ts
├── patients/          # Manajemen pasien
│   ├── patients.routes.ts
│   └── patients.controller.ts
├── monitoring/        # Data monitoring
│   ├── monitoring.routes.ts
│   └── monitoring.controller.ts
├── reports/           # Laporan + export
│   ├── reports.routes.ts
│   └── reports.controller.ts
└── settings/          # Pengaturan sistem
    ├── settings.routes.ts
    └── settings.controller.ts
```

### Pattern Per Modul

```
┌─────────────────────────────────┐
│          Routes                 │
│  • Define HTTP endpoints        │
│  • Attach middleware            │
│  • Delegate to controller      │
├─────────────────────────────────┤
│         Controller              │
│  • Request/response handling    │
│  • Input validation             │
│  • Business logic               │
│  • Call Prisma ORM             │
│  • Return formatted response    │
├─────────────────────────────────┤
│      Prisma ORM (shared)        │
│  • Database queries             │
│  • Transaction management       │
│  • Relationship handling       │
├─────────────────────────────────┤
│         Database                │
│  • SQLite (dev)                 │
│  • PostgreSQL (prod)            │
└─────────────────────────────────┘
```

### Shared Layer

```
shared/
├── app-error.ts              # Custom error classes
│   ├── AppError              # Base error
│   ├── NotFoundError (404)   # Resource not found
│   ├── UnauthorizedError     # Authentication failed
│   ├── ForbiddenError (403)  # Access denied
│   ├── ValidationError (400) # Input validation
│   └── ConflictError (409)   # Duplicate resource
│
├── status-calculator.ts      # Threshold logic
│   ├── calculateBpmStatus()
│   ├── calculateSpo2Status()
│   ├── calculateCompositeStatus()
│   └── calculateStatuses()   # Convenience: all three
│
├── types.ts                  # Shared type definitions
│   ├── BpmStatus, Spo2Status, CompositeStatus
│   ├── VitalSignsInput, VitalSignsResult
│   └── PaginationParams, PaginatedResult
│
├── jwt.ts                    # JWT utilities
│   ├── generateAccessToken()
│   ├── generateTokenPair()
│   ├── verifyToken()
│   ├── blacklistToken()
│   └── isTokenBlacklisted()
│
└── esp32-auth-middleware.ts  # ESP32 Socket.IO auth
    ├── hashApiKey()          # SHA-256 hashing
    └── esp32SocketAuthMiddleware()
```

---

## Database Schema

### Entity Relationship Diagram (Text)

```
┌──────────────────┐       ┌──────────────────────┐
│      Admin       │       │       Patient         │
├──────────────────┤       ├──────────────────────┤
│ id (PK)          │       │ id (PK)              │
│ name             │       │ patientId (UK)        │── P-001, P-002, ...
│ email (UK)       │       │ name                 │
│ passwordHash     │       │ nik (UK)             │── Encrypted at rest
│ createdAt        │       │ gender               │── L / P
│ updatedAt        │       │ birthDate            │
└────────┬─────────┘       │ age                  │── Computed
         │                 │ address              │
         │ 1               │ phone                │
         ▼                 │ bloodType            │── A, B, AB, O
┌──────────────────┐       │ height (cm)          │
│    AuditLog      │       │ weight (kg)          │
├──────────────────┤       │ medicalHistory       │── Encrypted at rest
│ id (PK)          │       │ doctorNote           │
│ adminId (FK) ────┼───┘   │ createdAt            │
│ patientId (FK)───┼────┘  │ updatedAt            │
│ action           │       └──────────┬───────────┘
│ details          │                  │ 1
│ ipAddress        │                  │
│ createdAt        │                  ▼
└──────────────────┘       ┌──────────────────────┐
                           │  MonitoringSession    │
                     ┌─────├──────────────────────┤
                     │     │ id (PK)              │
                     │     │ patientId (FK) ───────┼───┘
                     │     │ status               │── ACTIVE/COMPLETED/CANCELLED
                     │     │ startTime            │
                     │     │ endTime              │
                     │     │ notes                │
                     │     │ createdAt            │
                     │     └──────────┬───────────┘
                     │                │ 1
                     │                │
┌──────────────────┐ │                │
│   Esp32Device    │ │                │
├──────────────────┤ │                ▼
│ id (PK)          │ │  ┌──────────────────────────┐
│ deviceId (UK)    │ │  │        Reading            │
│ apiKey           │ │  ├──────────────────────────┤
│ label            │─┘  │ id (PK)                  │
│ isActive         │    │ patientId (FK) ──────────┼──────┐
│ createdAt        │    │ bpm                      │
│ updatedAt        │    │ spo2                     │
└──────────────────┘    │ bpmStatus                │── BRADICARDIA/NORMAL/...
                        │ spo2Status               │── NORMAL/HIPOKSEMIA_*
                        │ status                   │── NORMAL/WASPADA/DARURAT
                        │ sessionId (FK) ──────────┼──────┘
                        │ createdAt                │
                        └──────────────────────────┘

┌──────────────────────┐
│       Setting         │
├──────────────────────┤
│ id (PK)              │
│ key (UK)             │── min_bpm, max_bpm, min_spo2, max_spo2, ...
│ value                │
│ description          │
│ updatedAt            │
└──────────────────────┘
```

### Deskripsi Model

#### 1. Admin

Menyimpan data administrator sistem.

| Field          | Tipe     | Constraints      | Deskripsi                        |
|----------------|----------|------------------|----------------------------------|
| `id`           | Int      | PK, Auto-increment | ID admin                      |
| `name`         | String   | Required         | Nama admin                       |
| `email`        | String   | Unique, Required | Email admin                      |
| `passwordHash` | String   | Required         | Hash bcrypt (12 rounds)          |
| `createdAt`    | DateTime | Default: now     | Waktu pembuatan                  |
| `updatedAt`    | DateTime | Auto             | Waktu update                     |

#### 2. Patient

Menyimpan data pasien yang akan dipantau.

| Field            | Tipe     | Constraints      | Deskripsi                        |
|------------------|----------|------------------|----------------------------------|
| `id`             | Int      | PK, Auto-increment | ID internal                   |
| `patientId`      | String   | Unique, Required | ID pasien (format: P-001)        |
| `name`           | String   | Required         | Nama pasien                      |
| `nik`            | String?  | Unique           | NIK (terenkripsi di database)    |
| `gender`         | String   | Required         | L / P                            |
| `birthDate`      | DateTime | Required         | Tanggal lahir                    |
| `age`            | Int      | Computed         | Usia (dihitung dari birthDate)   |
| `address`        | String?  | -                | Alamat                           |
| `phone`          | String?  | -                | No. telepon                      |
| `bloodType`      | String?  | -                | Golongan darah (A/B/AB/O)        |
| `height`         | Float?   | -                | Tinggi badan (cm)                |
| `weight`         | Float?   | -                | Berat badan (kg)                 |
| `medicalHistory` | String?  | -                | Riwayat medis (terenkripsi)      |
| `doctorNote`     | String?  | -                | Catatan dokter                   |

**Relasi:** Satu pasien memiliki banyak `Reading` dan `MonitoringSession`.

#### 3. Reading (Vital Sign)

Menyimpan setiap pembacaan BPM dan SpO₂.

| Field        | Tipe     | Constraints         | Deskripsi                     |
|--------------|----------|---------------------|-------------------------------|
| `id`         | Int      | PK, Auto-increment  | ID pembacaan                  |
| `patientId`  | Int      | FK → Patient.id     | ID pasien                     |
| `bpm`        | Int      | Required            | Denyut jantung               |
| `spo2`       | Int      | Required            | Saturasi oksigen              |
| `bpmStatus`  | String   | Required            | BRADICARDIA/NORMAL/TACHY_*    |
| `spo2Status` | String   | Required            | NORMAL/HIPOKSEMIA_*           |
| `status`     | String   | Required, Indexed   | NORMAL/WASPADA/DARURAT        |
| `sessionId`  | Int?     | FK → Session.id     | Sesi monitoring               |
| `createdAt`  | DateTime | Default: now, Indexed | Waktu pembacaan             |

**Index:** `(patientId, createdAt)` untuk query riwayat, `status` untuk filter, `createdAt` untuk range date.

#### 4. MonitoringSession

Menyimpan sesi monitoring untuk setiap pasien.

| Field       | Tipe      | Constraints        | Deskripsi                    |
|-------------|-----------|--------------------|------------------------------|
| `id`        | Int       | PK, Auto-increment | ID sesi                      |
| `patientId` | Int       | FK → Patient.id    | ID pasien                    |
| `status`    | String    | Default: ACTIVE    | ACTIVE/COMPLETED/CANCELLED  |
| `startTime` | DateTime  | Default: now       | Waktu mulai                  |
| `endTime`   | DateTime? | -                  | Waktu selesai                |
| `notes`     | String?   | -                  | Catatan sesi                 |

**Index:** `(patientId, startTime)` untuk query sesi per pasien.

#### 5. Setting

Menyimpan konfigurasi sistem key-value.

| Field         | Tipe     | Constraints | Deskripsi                       |
|---------------|----------|-------------|---------------------------------|
| `id`          | Int      | PK          | ID setting                      |
| `key`         | String   | Unique      | Key (min_bpm, max_bpm, dll)     |
| `value`       | String   | Required    | Value                           |
| `description` | String?  | -           | Deskripsi                       |

#### 6. Esp32Device

Menyimpan data perangkat ESP32 yang terdaftar.

| Field       | Tipe     | Constraints      | Deskripsi                     |
|-------------|----------|------------------|-------------------------------|
| `id`        | Int      | PK, Auto-increment | ID perangkat                |
| `deviceId`  | String   | Unique, Required | ID unik perangkat              |
| `apiKey`    | String   | Required         | SHA-256 hash dari API key     |
| `label`     | String?  | -                | Label/lokasi perangkat        |
| `isActive`  | Boolean  | Default: true    | Status aktif                  |

#### 7. AuditLog

Menyimpan log audit untuk semua aktivitas admin.

| Field       | Tipe      | Constraints      | Deskripsi                     |
|-------------|-----------|------------------|-------------------------------|
| `id`        | Int       | PK, Auto-increment | ID log                     |
| `adminId`   | Int       | FK → Admin.id    | ID admin                      |
| `patientId` | Int?      | FK → Patient.id  | ID pasien (opsional)          |
| `action`    | String    | Required         | VIEW/CREATE/UPDATE/DELETE     |
| `details`   | String?   | -                | Detail aktivitas              |
| `ipAddress` | String?   | -                | Alamat IP                     |
| `createdAt` | DateTime  | Default: now, Indexed | Waktu aktivitas      |

---

## Arsitektur Keamanan

### 1. Autentikasi JWT

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Client     │     │   Backend        │     │  Database    │
└──────┬───────┘     └────────┬─────────┘     └──────┬───────┘
       │                      │                      │
       │  POST /auth/login    │                      │
       │  { email, password } │                      │
       │─────────────────────▶│                      │
       │                      │  Cari admin by email │
       │                      │─────────────────────▶│
       │                      │  Admin data          │
       │                      │◀─────────────────────│
       │                      │                      │
       │                      │  bcrypt.compare()    │
       │                      │                      │
       │                      │  jwt.sign({          │
       │                      │    adminId,          │
       │                      │    email,            │
       │                      │    iat,              │
       │                      │    exp               │
       │                      │  }, JWT_SECRET)      │
       │                      │                      │
       │  { token, admin }    │                      │
       │◀─────────────────────│                      │
```

### 2. Lapisan Keamanan

| Lapisan            | Teknologi                  | Konfigurasi                              |
|--------------------|----------------------------|------------------------------------------|
| Transport          | Helmet                     | CSP, HSTS (1 tahun), XSS, frameguard    |
| CORS               | cors                       | Origin terbatas, credentials enabled     |
| Rate Limiting      | express-rate-limit         | Global: 200/15min, Auth: 20/15min       |
| Autentikasi        | JWT (HS256)                | Secret ≥ 64 chars, expiry 24h/7d        |
| Password           | bcryptjs                   | Salt rounds: 12                          |
| Validasi Input     | Manual di controller       | Tipe data, range, format                 |
| Error Handling     | Global error handler       | Generic error di production              |
| Logging            | Winston                    | Log ke file + console, rotate 5MB       |
| Audit Trail        | AuditLog model             | Semua action CREATE/UPDATE/DELETE        |

### 3. Autentikasi ESP32

```
┌─────────────┐          ┌─────────────────┐          ┌──────────────┐
│   ESP32     │          │   Socket.IO     │          │  Database    │
└──────┬──────┘          └────────┬────────┘          └──────┬───────┘
       │                         │                          │
       │  handshake auth:        │                          │
       │  { deviceId, apiKey }   │                          │
       │────────────────────────▶│                          │
       │                         │  hashApiKey(apiKey)      │
       │                         │  → SHA-256 hex            │
       │                         │                          │
       │                         │  Cari device by:         │
       │                         │  deviceId + apiKeyHash   │
       │                         │─────────────────────────▶│
       │                         │  Device data             │
       │                         │◀─────────────────────────│
       │                         │                          │
       │                         │  if !device → error      │
       │                         │  if !isActive → error    │
       │                         │                          │
       │  socket connected       │                          │
       │◀────────────────────────│                          │
```

### 4. Enkripsi Data Sensitif

Field yang memerlukan enkripsi di database:

| Field            | Model   | Metode Enkripsi        |
|------------------|---------|------------------------|
| `passwordHash`   | Admin   | bcrypt (one-way)       |
| `nik`            | Patient | AES-256 (at rest)      |
| `medicalHistory` | Patient | AES-256 (at rest)      |
| `apiKey`         | ESP32   | SHA-256 (hash)         |

---

## Arsitektur Socket.IO

### Koneksi dan Rooms

```
Socket.IO Server (Namespace: /)
│
├── Admin Clients (JWT Auth)
│   │
│   ├── Room: "admins" (broadcast channel)
│   │   └── Menerima: monitoring:update, monitoring:alert
│   │
│   └── Room: "patient:{id}" (per-patient channel)
│       ├── subscribe:patient → join room
│       └── unsubscribe:patient → leave room
│
└── ESP32 Devices (Device Auth)
    │
    └── Tidak join room
        ├── Mengirim: esp32:reading
        └── Menerima: esp32:ack, esp32:error
```

### Event Map

| Event                    | Arah         | Trigger              | Penerima             |
|--------------------------|--------------|----------------------|----------------------|
| `esp32:reading`          | ESP32 → Server | Data vital baru    | Server               |
| `esp32:ack`              | Server → ESP32  | Data tersimpan    | ESP32 sender         |
| `esp32:error`            | Server → ESP32  | Validasi gagal    | ESP32 sender         |
| `monitoring:update`      | Server → Client | Pembacaan baru    | All admin clients    |
| `monitoring:alert`       | Server → Client | Threshold violation | All admin clients  |
| `subscribe:patient`      | Client → Server | Subscribe pasien  | Server               |
| `unsubscribe:patient`    | Client → Server | Unsubscribe       | Server               |

---

## Arsitektur gRPC

### Service Definitions

Backend mendefinisikan 6 service gRPC dalam file `proto/monitoring.proto`:

| Service              | Methods                                               |
|----------------------|-------------------------------------------------------|
| `AuthService`        | `Login`, `Logout`, `GetCurrentAdmin`                  |
| `DashboardService`   | `GetDashboardStats`                                   |
| `PatientService`     | `ListPatients`, `GetPatient`, `CreatePatient`, `UpdatePatient`, `DeletePatient` |
| `MonitoringService`  | `GetRealtimeMonitoring`, `GetMonitoringHistory`, `SaveReading` |
| `ReportService`      | `GetDailyReport`, `GetMonthlyReport`, `ExportReport`  |
| `SettingsService`    | `GetSettings`, `UpdateSettings`                       |

### Alur Komunikasi gRPC

```
Express Controller
    │
    ├──→ (Direct Prisma) → Database [Default Path]
    │
    └──→ gRPC Client → gRPC Server → Prisma → Database [Optional]
         │
         │  gRPC Server (port 50051)
         │  ┌─────────────────────────┐
         │  │ AuthHandler             │
         │  │ DashboardHandler        │
         │  │ PatientHandler          │
         │  │ MonitoringHandler       │
         │  │ ReportHandler           │
         │  │ SettingsHandler         │
         │  └─────────────────────────┘
```

---

## Logging

### Winston Logger — Konfigurasi

```
Winston Logger
│
├── Console Transport
│   └── Level: debug (dev) / info (prod)
│   └── Format: colorized, timestamp
│
├── File Transport (error)
│   ├── Filename: logs/error.log
│   ├── Level: error
│   ├── Max size: 5MB
│   └── Max files: 5
│
└── File Transport (combined)
    ├── Filename: logs/combined.log
    ├── Level: info
    ├── Max size: 5MB
    └── Max files: 10
```

### Log Format

```
2026-07-07 10:30:00 [INFO] GET /api/v1/patients → 200 (45ms)
2026-07-07 10:30:00 [WARN] POST /api/v1/auth/login → 401 (12ms)
2026-07-07 10:30:01 [ERROR] Unhandled Rejection: some error
```

Log mencakup:
- **HTTP Requests:** Method, URL, status code, response time
- **Database Operations:** Query execution (development mode)
- **Socket Events:** Connection, disconnection, error
- **Authentication:** Login/logout attempts
- **CRUD Operations:** Patient/settings changes

---

## Catatan Arsitektur

1. **SQLite untuk Development:** Database SQLite digunakan untuk kemudahan setup lokal. Untuk production, migrasikan ke PostgreSQL.

2. **In-Memory Token Blacklist:** Blacklist token disimpan dalam memory. Untuk production dengan multiple instance, gunakan Redis.

3. **Threshold Cache:** Ambang batas BPM/SpO₂ di-cache setiap 5 menit untuk mengurangi query ke database.

4. **Auto-Create Session:** Jika ESP32 mengirim data tanpa sessionId, sistem akan mencari sesi ACTIVE atau membuat sesi baru secara otomatis.

5. **Audit Trail:** Setiap operasi CREATE, UPDATE, DELETE pada pasien dan settings dicatat dalam AuditLog untuk kepatuhan dan troubleshooting.
