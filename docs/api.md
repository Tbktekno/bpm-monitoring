# Dokumentasi API — BPM & SpO₂ Monitoring Dashboard

**Base URL (Development):** `http://localhost:5000/api/v1`
**Base URL (Production):** `https://{domain}/api/v1`
**Health Check:** `GET http://localhost:5000/api/health`

---

## Daftar Isi

- [Format Respons](#format-respons)
- [Autentikasi](#autentikasi)
- [Kode Error](#kode-error)
- [Endpoint](#endpoint)
  - [1. Auth](#1-auth)
  - [2. Dashboard](#2-dashboard)
  - [3. Patients](#3-patients)
  - [4. Monitoring](#4-monitoring)
  - [5. Reports](#5-reports)
  - [6. Settings](#6-settings)
  - [7. Devices](#7-devices)
  - [8. Readings (Ingestion Device)](#8-readings-ingestion-device)
  - [9. Health Check](#9-health-check)
- [Status Thresholds](#status-thresholds)
- [Rate Limiting](#rate-limiting)
- [Catatan Penting](#catatan-penting)

---

## Format Respons

Semua endpoint REST mengembalikan JSON seragam:

### Sukses
```json
{
  "success": true,
  "data": { ... },
  "message": "Deskripsi sukses"
}
```

### Error
```json
{
  "success": false,
  "data": null,
  "message": "Deskripsi error",
  "error": "ErrorCode"
}
```

Untuk `ValidationError`, objek `error` berisi detail field:
```json
{
  "success": false,
  "data": null,
  "message": "Validation failed",
  "error": {
    "name": "Name must be at least 2 characters",
    "gender": "Gender must be L or P"
  }
}
```

### Pagination
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5
    }
  },
  "message": "..."
}
```

---

## Autentikasi

Sebagian besar endpoint memerlukan JWT Bearer token.

**Header:**
```
Authorization: Bearer <token>
```

**Mendapatkan token:** login ke `POST /auth/login`.

**Masa berlaku token:**

| Mode | Durasi |
|------|--------|
| Default | 24 jam |
| Remember me | 7 hari |

**Logout:** token di-blacklist sehingga tidak dapat dipakai lagi.

---

## Kode Error

| HTTP | Kode | Deskripsi |
|------|------|-----------|
| 400 | `VALIDATION_ERROR` | Input tidak valid |
| 401 | `UNAUTHORIZED` | Token tidak valid / kedaluwarsa |
| 401 | `INVALID_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_NOT_ACTIVE`, `TOKEN_VERIFICATION_FAILED` | Detail kegagalan JWT |
| 403 | `FORBIDDEN` | Akses ditolak |
| 404 | `NOT_FOUND` | Resource tidak ditemukan |
| 409 | `CONFLICT` | Resource sudah ada (duplicate) |
| 429 | `RateLimitError` / `AuthRateLimitError` | Terlalu banyak permintaan |
| 500 | `INTERNAL_ERROR` | Error internal server |

---

## Endpoint

---

### 1. Auth

#### 1.1 Login
```
POST /auth/login
```
**Autentikasi:** Tidak diperlukan

**Request Body:**
```json
{
  "email": "admin@monitoring-bpm.web.id",
  "password": "Admin123!",
  "rememberMe": false
}
```

| Field | Tipe | Wajib | Deskripsi |
|-------|------|-------|-----------|
| `email` | string | Ya | Email admin |
| `password` | string | Ya | Password |
| `rememberMe` | boolean | Tidak | Perpanjang masa token (7d) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "admin": { "id": 1, "name": "Admin Dashboard", "email": "admin@monitoring-bpm.web.id" }
  },
  "message": "Login successful"
}
```

**Error:** `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401, email/password salah), `AuthRateLimitError` (429).

---

#### 1.2 Logout
```
POST /auth/logout
```
**Autentikasi:** Wajib

**Response 200:**
```json
{ "success": true, "data": null, "message": "Logout successful" }
```

---

#### 1.3 Get Current Admin
```
GET /auth/me
```
**Autentikasi:** Wajib

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Admin Dashboard",
    "email": "admin@monitoring-bpm.web.id",
    "createdAt": "2026-07-07T00:00:00.000Z",
    "updatedAt": "2026-07-07T00:00:00.000Z"
  },
  "message": "Profile retrieved"
}
```

---

### 2. Dashboard

#### 2.1 Get Dashboard Statistics
```
GET /dashboard
```
**Autentikasi:** Wajib

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalPatients": 6,
    "statusDistribution": {
      "normal": 5,
      "waspada": 0,
      "darurat": 1,
      "tanpaData": 0
    },
    "averages": {
      "avgBpm": 88,
      "avgSpo2": 95,
      "totalReadings": 60,
      "range": "24h"
    },
    "last10Readings": [
      {
        "id": 61,
        "patientId": 6,
        "bpm": 59,
        "spo2": 94,
        "bpmStatus": "BRADICARDIA",
        "spo2Status": "HIPOKSEMIA_RINGAN",
        "status": "DARURAT",
        "createdAt": "2026-07-29T10:30:00.000Z",
        "patient": { "id": 6, "patientId": "P-006", "name": "Reka" }
      }
    ],
    "chartData": [
      { "hour": "08:00", "avgBpm": 82, "avgSpo2": 97, "readingCount": 5 }
    ],
    "timestamp": "2026-07-29T10:30:00.000Z"
  },
  "message": "Dashboard data retrieved"
}
```

**Struktur Data:**

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `totalPatients` | number | Total pasien |
| `statusDistribution.*` | number | Distribusi status pasien (dari reading terakhir tiap pasien) |
| `statusDistribution.tanpaData` | number | Pasien tanpa reading |
| `averages.avgBpm` / `avgSpo2` | number | Rata-rata BPM/SpO₂ |
| `averages.totalReadings` | number | Jumlah reading yang dipakai |
| `averages.range` | string | `24h`, `168h`, `all`, `none` |
| `last10Readings[]` | array | 10 reading terbaru (seluruh waktu) |
| `chartData[]` | array | Rata-rata per jam hari ini (`HH:00`) |

> Strategi rata-rata: coba 24 jam → 7 hari → seluruh waktu.

---

### 3. Patients

Semua endpoint memerlukan autentikasi.

#### 3.1 List Patients
```
GET /patients?page=1&limit=10&search=budi
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `page` | number | 1 | Halaman |
| `limit` | number | 10 | Item/halaman (max 100) |
| `search` | string | - | Cari nama atau patientId |

**Response 200:** (item berisi data pasien + `readings` terbaru + `_count`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "patientId": "P-001",
        "name": "Budi Santoso",
        "nik": "3174011508800001",
        "gender": "L",
        "birthDate": "1980-08-15T00:00:00.000Z",
        "age": 45,
        "address": "Jl. Merdeka No. 10, Jakarta Pusat",
        "phone": "081234567890",
        "bloodType": "O",
        "height": 170,
        "weight": 75,
        "medicalHistory": "Hipertensi stage 1, DM tipe 2",
        "doctorNote": "Kontrol rutin",
        "createdAt": "2026-07-07T00:00:00.000Z",
        "updatedAt": "2026-07-07T00:00:00.000Z",
        "readings": [
          { "status": "NORMAL", "bpm": 90, "spo2": 97, "createdAt": "..." }
        ],
        "_count": { "readings": 10 }
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 6, "totalPages": 1 }
  },
  "message": "Patients retrieved"
}
```

---

#### 3.2 Get Patient Detail
```
GET /patients/:id
```
`id` = ID internal pasien (integer).

**Response 200:** data pasien + `readings` + `sessions` + `_count`.
**Error:** `NOT_FOUND` (404) jika pasien tidak ditemukan.

---

#### 3.3 Create Patient
```
POST /patients
```

**Request Body & Validasi:**

| Field | Tipe | Wajib | Validasi |
|-------|------|-------|----------|
| `name` | string | Ya | Min 2 karakter |
| `nik` | string | Tidak | Tepat 16 digit, unique |
| `gender` | string | Ya | `L` atau `P` |
| `birthDate` | string | Ya | ISO 8601 |
| `address` | string | Tidak | - |
| `phone` | string | Tidak | - |
| `bloodType` | string | Tidak | `A`, `B`, `AB`, `O` |
| `height` | number | Tidak | 50–250 cm |
| `weight` | number | Tidak | 2–300 kg |
| `medicalHistory` | string | Tidak | - |
| `doctorNote` | string | Tidak | - |

`patientId` dibuat otomatis (format `P-XXX`). Usia (`age`) dihitung otomatis dari `birthDate`.

**Response 201:** data pasien yang dibuat.

---

#### 3.4 Update Patient
```
PUT /patients/:id
```
Partial update — semua field opsional. Validasi sama seperti create.
**Response 200:** data pasien yang diupdate.

---

#### 3.5 Delete Patient
```
DELETE /patients/:id
```
**Response 200:**
```json
{ "success": true, "data": null, "message": "Patient deleted successfully" }
```
> Delete akan menghapus data terkait (readings, sessions, audit logs) secara cascading.

---

### 4. Monitoring

Semua endpoint memerlukan autentikasi.

#### 4.1 Get Active Monitoring
```
GET /monitoring
```
Mengembalikan semua sesi ACTIVE beserta reading terbaru.
**Response 200:** `{ items: [...], totalActive: n }`

---

#### 4.2 Get Realtime Data
```
GET /monitoring/realtime
```
Data terbaru per pasien yang memiliki reading.
**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "patient": { "id": 1, "patientId": "P-001", "name": "Budi Santoso", "gender": "L", "age": 45 },
      "latestReading": { "id": 10, "bpm": 90, "spo2": 97, "bpmStatus": "NORMAL", "spo2Status": "NORMAL", "status": "NORMAL", "createdAt": "...", "sessionId": 1 },
      "activeSessionId": 1,
      "isMonitoring": true
    }
  ],
  "message": "Realtime data retrieved"
}
```

---

#### 4.3 Start Monitoring Session
```
POST /monitoring/session/start
```
**Request Body:**
```json
{ "patientId": 1, "deviceId": "ESP32-ALPHA-001" }
```

| Field | Tipe | Wajib | Deskripsi |
|-------|------|-------|-----------|
| `patientId` | number | Ya | ID pasien |
| `deviceId` | string | Tidak | ID device ESP32 |

**Response 201:** sesi dibuat (status `ACTIVE`).
**Error:**
- `409` jika device sudah punya sesi ACTIVE
- `404` jika pasien tidak ditemukan
- `400` jika `patientId` kosong

---

#### 4.4 Stop Monitoring Session
```
POST /monitoring/session/stop
```
**Request Body:**
```json
{ "sessionId": 1 }
```
atau
```json
{ "deviceId": "ESP32-ALPHA-001" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "patientId": 1,
    "status": "COMPLETED",
    "startTime": "...",
    "endTime": "...",
    "_count": { "readings": 60 }
  },
  "message": "Sesi monitoring selesai. Total 60 data terekam."
}
```

---

#### 4.5 List Monitoring Sessions
```
GET /monitoring/sessions?status=COMPLETED&patientId=1&page=1&limit=20
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `status` | string | - | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `patientId` | number | - | Filter pasien |
| `page` | number | 1 | Halaman |
| `limit` | number | 20 | Item/halaman (max 100) |

**Response 200:** `{ items: [...], pagination: {...} }` (item menyertakan `patient` dan `_count.readings`).

---

#### 4.6 Get Session Readings
```
GET /monitoring/session/:sessionId
```
Mengembalikan sesi + seluruh readings (ascending, max 1000).
**Response 200:**
```json
{
  "success": true,
  "data": {
    "session": { "id": 1, "patientId": 1, "deviceId": "ESP32-ALPHA-001", "status": "COMPLETED", "startTime": "...", "endTime": "...", "notes": null },
    "readings": [ { "id": 1, "bpm": 85, "spo2": 98, "status": "NORMAL", "createdAt": "..." } ],
    "totalReadings": 60
  },
  "message": "Session readings retrieved"
}
```

---

#### 4.7 Get Patient Readings
```
GET /monitoring/patient/:patientId
```
`patientId` dapat berupa ID internal (angka) atau `P-XXX`.
**Query:** `limit` (default 50, max 200).
**Response 200:** `{ readings: [...], pagination: {...} }`

---

#### 4.8 Get Monitoring History
```
GET /monitoring/history?page=1&limit=20&startDate=2026-07-01&endDate=2026-07-07&status=NORMAL&patientId=1
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `page` | number | 1 | Halaman |
| `limit` | number | 20 | Item/halaman (max 200) |
| `startDate` | string | - | Awal rentang tanggal |
| `endDate` | string | - | Akhir rentang tanggal |
| `status` | string | - | `NORMAL`, `WASPADA`, `DARURAT` |
| `patientId` | number/string | - | ID internal atau `P-XXX` |
| `bpmStatus` | string | - | `BRADICARDIA`, `NORMAL`, `TACHY_RINGAN`, `TACHY_BERAT` |
| `spo2Status` | string | - | `NORMAL`, `HIPOKSEMIA_RINGAN`, `HIPOKSEMIA_SEDANG`, `HIPOKSEMIA_BERAT` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "readings": [
      {
        "id": 1,
        "patientId": 1,
        "bpm": 85,
        "spo2": 98,
        "bpmStatus": "NORMAL",
        "spo2Status": "NORMAL",
        "status": "NORMAL",
        "sessionId": 1,
        "createdAt": "...",
        "patient": { "id": 1, "patientId": "P-001", "name": "Budi Santoso", "gender": "L", "age": 45 },
        "session": { "id": 1, "status": "COMPLETED", "startTime": "..." }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
  },
  "message": "History retrieved"
}
```

> ⚠ Field data bernama `readings` (bukan `items`) pada endpoint history.

---

### 5. Reports

Semua endpoint memerlukan autentikasi.

#### 5.1 Get Daily Report
```
GET /reports/daily?startDate=2026-07-01&endDate=2026-07-07
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `startDate` | string | 30 hari lalu | Tanggal awal |
| `endDate` | string | Hari ini | Tanggal akhir |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "period": { "start": "...", "end": "..." },
    "summary": { "totalReadings": 500, "normalCount": 350, "waspadaCount": 100, "daruratCount": 50 },
    "daily": [
      { "date": "2026-07-01", "totalReadings": 80, "normalCount": 60, "waspadaCount": 15, "daruratCount": 5, "avgBpm": 78, "avgSpo2": 97 }
    ]
  },
  "message": "Daily report generated"
}
```

---

#### 5.2 Get Monthly Report
```
GET /reports/monthly?year=2026
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `year` | number | Tahun sekarang | Tahun (2000–2100) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "year": 2026,
    "summary": { "totalReadings": 500, "totalPatients": 5 },
    "monthly": [
      { "month": 7, "year": 2026, "totalReadings": 500, "uniquePatients": 5, "normalCount": 350, "waspadaCount": 100, "daruratCount": 50, "avgBpm": 85, "avgSpo2": 96 }
    ]
  },
  "message": "Monthly report generated"
}
```

---

#### 5.3 Export PDF (Harian/Bulanan)
```
GET /reports/export/pdf?type=daily&startDate=2026-07-01&endDate=2026-07-07
```

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `type` | string | `daily` | `daily` atau `monthly` |
| `startDate` | string | 30 hari lalu | Tanggal awal |
| `endDate` | string | Hari ini | Tanggal akhir |

**Response:** `application/pdf` (file download) berisi judul, periode, ringkasan, dan tabel detail reading.

---

#### 5.4 Export Excel
```
GET /reports/export/excel?startDate=2026-07-01&endDate=2026-07-07
```
**Response:** `.xlsx` dengan 2 sheet: **Summary** dan **Readings**.

---

#### 5.5 Export Session PDF
```
GET /reports/export/session-pdf?sessionId=1
```

| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|-------|-----------|
| `sessionId` | number | Ya | ID sesi monitoring |

**Response:** `application/pdf` — **Laporan Hasil Monitoring** bergaya rumah sakit yang berisi:
- Header dokumen (judul "LAPORAN HASIL MONITORING")
- Tabel Data Pasien & Sesi: Nama, ID, Waktu Mulai/Selesai, Device (label dari `Esp32Device`), Total Data
- Tabel Hasil Pemeriksaan: Parameter | Rata-rata | Nilai Normal | Keterangan
- Kotak Status Penyakit (Dugaan): berdasarkan rata-rata BPM & SpO₂
- Footer keterangan generate otomatis

---

### 6. Settings

Semua endpoint memerlukan autentikasi.

#### 6.1 Get Settings
```
GET /settings
```
**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      { "id": 1, "key": "min_bpm", "value": "60", "description": "Batas bawah BPM normal", "updatedAt": "..." }
    ],
    "map": { "min_bpm": "60", "max_bpm": "100", "min_spo2": "95", "max_spo2": "100" }
  },
  "message": "Settings retrieved"
}
```

**Valid keys:**
| Key | Default | Deskripsi |
|-----|---------|-----------|
| `min_bpm` | 60 | Batas bawah BPM |
| `max_bpm` | 100 | Batas atas BPM |
| `min_spo2` | 95 | Batas bawah SpO₂ |
| `max_spo2` | 100 | Batas atas SpO₂ |
| `alert_bpm_high` | - | Ambang alert BPM tinggi |
| `alert_bpm_low` | - | Ambang alert BPM rendah |
| `alert_spo2_low` | - | Ambang alert SpO₂ rendah |
| `monitoring_interval` | - | Interval kirim data (detik) |
| `auto_session_timeout` | - | Timeout sesi (menit) |
| `custom_*` | - | Setting kustom |

---

#### 6.2 Update Settings
```
PUT /settings
```
**Request Body:** objek `{ key: "value", ... }`.

**Validasi:**
- Nilai harus string; angka harus bilangan positif.
- `min_bpm`: 30–200, `max_bpm`: 30–250, spo2: 50–100.
- `min_*` harus kurang dari `max_*`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": 3,
    "changes": [ { "key": "min_bpm", "oldValue": "50", "newValue": "60" } ]
  },
  "message": "3 setting(s) updated successfully"
}
```

---

#### 6.3 Update Profile
```
PUT /settings/profile
```
**Request Body:**
```json
{ "name": "Admin Baru", "email": "admin@example.com" }
```
**Response 200:** `{ id, adminName, adminEmail }`

---

#### 6.4 Update Thresholds
```
PUT /settings/thresholds
```
**Request Body:**
```json
{ "minBpm": 60, "maxBpm": 100, "minSpo2": 95, "maxSpo2": 100 }
```
**Response 200:** `{ id, adminName, adminEmail, minBpm, maxBpm, minSpo2, maxSpo2 }`

---

#### 6.5 Change Password
```
PUT /settings/password
```
**Request Body:**
```json
{ "currentPassword": "Admin123!", "newPassword": "Baru123!", "confirmPassword": "Baru123!" }
```
**Response 200:** `{ success, data: null, message: "Password changed successfully" }`

---

#### 6.6 Clear Monitoring Data
```
DELETE /settings/data
```
Menghapus semua `Reading`, `MonitoringSession`, `AuditLog` — tanpa menghapus `Esp32Device` dan `Admin`.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "deletedReadings": 60,
    "deletedSessions": 6,
    "deletedAuditLogs": 12,
    "keptDevices": 3,
    "keptAdmins": 1
  },
  "message": "Berhasil menghapus 60 data monitoring, 6 sesi, 12 log. Device & Admin tetap aman."
}
```

---

### 7. Devices

Semua endpoint memerlukan autentikasi.

#### 7.1 List Devices
```
GET /devices?page=1&limit=10&search=
```
**Response 200:** `{ items: [...], pagination: {...} }`
Item berisi `id, deviceId, label, isActive, createdAt, updatedAt` (tanpa `apiKey`).

#### 7.2 Get Device
```
GET /devices/:id
```
**Response 200:** detail device.

#### 7.3 Create Device
```
POST /devices
```
**Request Body:**
```json
{ "deviceId": "ESP32-DELTA-004", "label": "Ruang ICU", "isActive": true }
```
**Response 201:** berisi `rawApiKey` **hanya sekali**:
```json
{
  "success": true,
  "data": {
    "id": 4,
    "deviceId": "ESP32-DELTA-004",
    "label": "Ruang ICU",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "...",
    "rawApiKey": "bpm-a1b2c3...",
    "warning": "API Key ini hanya ditampilkan sekali. Simpan dengan aman!"
  },
  "message": "Device berhasil didaftarkan. Salin API Key sekarang!"
}
```
**Error:** `CONFLICT` (409) jika `deviceId` sudah terdaftar.

> API key dihasilkan acak (format `bpm-` + 64 hex), disimpan sebagai hash SHA-256.

#### 7.4 Update Device
```
PUT /devices/:id
```
Partial update (`deviceId`, `label`, `isActive`). API key **tidak** dapat diubah.

#### 7.5 Toggle Device
```
PATCH /devices/:id/toggle
```
Membalik `isActive`.

#### 7.6 Delete Device
```
DELETE /devices/:id
```

---

### 8. Readings (Ingestion Device)

#### 8.1 Create Reading (dari Device)
```
POST /readings/device
```
**Autentikasi:** Khusus — header device (BUKAN JWT).

**Headers:**
| Header | Deskripsi |
|--------|-----------|
| `x-device-id` | ID unik device (harus terdaftar & aktif) |
| `x-api-key` | API key plaintext device (min 16 karakter) |

**Request Body:**
```json
{ "bpm": 75, "spo2": 98 }
```

| Field | Tipe | Wajib | Validasi |
|-------|------|-------|----------|
| `bpm` | number | Ya | Integer 30–250 |
| `spo2` | number | Ya | Integer 50–100 |

**Response 201:**
```json
{
  "success": true,
  "data": { "readingId": 51, "status": "NORMAL" },
  "message": "Data tersimpan"
}
```

**Error (auth):**
| HTTP | Code | Kondisi |
|------|------|---------|
| 401 | `MISSING_DEVICE_ID` | Header `x-device-id` tidak ada |
| 401 | `MISSING_API_KEY` | Header `x-api-key` tidak ada |
| 401 | `INVALID_API_KEY` | API key terlalu pendek |
| 401 | `AUTH_FAILED` | device tidak cocok (tidak terdaftar / nonaktif / key salah) |

**Alur backend:** autentikasi device → validasi body → cari sesi ACTIVE device → hitung status → simpan reading → broadcast `monitoring:update` (+ `monitoring:alert` jika abnormal).

---

### 9. Health Check
```
GET /api/health
```
**Autentikasi:** Tidak diperlukan

**Response 200:**
```json
{
  "success": true,
  "data": { "status": "healthy", "timestamp": "...", "uptime": 12345.67 },
  "message": "Server is running"
}
```

---

## Status Thresholds

### BPM Status
| Rentang | bpmStatus |
|---------|-----------|
| < 60 | `BRADICARDIA` |
| 60 – 100 | `NORMAL` |
| 101 – 120 | `TACHY_RINGAN` |
| > 120 | `TACHY_BERAT` |

### SpO₂ Status
| Rentang | spo2Status |
|---------|------------|
| ≥ 95 | `NORMAL` |
| 90 – 94 | `HIPOKSEMIA_RINGAN` |
| 85 – 89 | `HIPOKSEMIA_SEDANG` |
| < 85 | `HIPOKSEMIA_BERAT` |

### Composite Status
| Kondisi | status |
|---------|--------|
| BPM & SpO₂ normal | `NORMAL` |
| `BRADICARDIA` / `TACHY_BERAT` / `HIPOKSEMIA_SEDANG` / `HIPOKSEMIA_BERAT` | `DARURAT` |
| Lainnya | `WASPADA` |

---

## Rate Limiting

| Endpoint | Window | Max | Keterangan |
|----------|--------|-----|------------|
| Global `/api/` | 15 menit | 200 (default) | Diterapkan di `server/index.ts` |
| Auth `/api/v1/auth/login` | 15 menit | 10 (default) | Proteksi brute-force |
| (Config) `/api/v1/readings` | 1 menit | 60 | Tersedia di `config/security.ts` (`esp32RateLimit`) |

Header respons: `RateLimit-*` (standard headers).

---

## Catatan Penting

1. **Format tanggal** menggunakan ISO 8601.
2. **Pagination** — gunakan untuk endpoint dengan banyak data.
3. **Token blacklist** — token yang di-logout tidak dapat digunakan lagi (in-memory; gunakan Redis untuk multi-instance).
4. **Autentikasi device** — via header `x-api-key` + `x-device-id` (SHA-256 di DB), bukan JWT.
5. **Audit trail** — operasi CRUD pada pasien, device, settings tercatat di `AuditLog`.
6. **Field response history** — endpoint `GET /monitoring/history` mengembalikan `readings` (bukan `items`).
7. **Session PDF** — device ditampilkan sebagai label dari tabel `Esp32Device` (fallback ke `deviceId`).
