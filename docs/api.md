# Dokumentasi API — BPM & SpO₂ Monitoring Dashboard

**Base URL:** `http://localhost:5000/api/v1`
**Base URL (Production):** `https://{domain}/api/v1`

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
  - [7. Health Check](#7-health-check)
- [Socket.IO Events](#socketio-events)
- [Status Thresholds](#status-thresholds)

---

## Format Respons

Semua endpoint REST mengembalikan respons dalam format JSON seragam:

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

Untuk `ValidationError`, objek `error` berisi detail field yang gagal validasi:

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

Endpoint yang mendukung pagination mengembalikan:

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

### JWT Bearer Token

Sebagian besar endpoint memerlukan autentikasi menggunakan JWT Bearer token.

**Header:**

```
Authorization: Bearer <token>
```

**Cara Mendapatkan Token:**

1. Login ke endpoint `POST /auth/login` dengan email dan password.
2. Sistem akan mengembalikan token JWT dalam respons.
3. Sertakan token di header `Authorization` untuk permintaan berikutnya.

**Masa Berlaku Token:**

| Mode         | Durasi |
|--------------|--------|
| Default      | 24 jam |
| Remember Me  | 7 hari |

**Logout:**

Token yang sudah logout akan dimasukkan ke dalam blacklist (in-memory) sehingga tidak dapat digunakan kembali.

---

## Kode Error

| HTTP Status | Kode Error              | Deskripsi                                        |
|-------------|------------------------|--------------------------------------------------|
| 400         | `VALIDATION_ERROR`      | Input tidak valid                                |
| 401         | `UNAUTHORIZED`          | Token tidak valid atau telah kedaluwarsa         |
| 403         | `FORBIDDEN`             | Akses ditolak                                    |
| 404         | `NOT_FOUND`             | Resource tidak ditemukan                         |
| 409         | `CONFLICT`              | Resource sudah ada (duplicate)                   |
| 429         | `RateLimitError`        | Terlalu banyak permintaan                        |
| 500         | `InternalServerError`   | Error internal server                            |

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

| Field        | Tipe    | Wajib | Deskripsi                          |
|-------------|---------|-------|------------------------------------|
| `email`     | string  | Ya    | Email admin                        |
| `password`  | string  | Ya    | Password admin                     |
| `rememberMe`| boolean | Tidak | Perpanjang masa berlaku token (7d) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "admin": {
      "id": 1,
      "name": "Admin Dashboard",
      "email": "admin@monitoring-bpm.web.id"
    }
  },
  "message": "Login successful"
}
```

**Error Codes:**

| Kode               | HTTP Status | Kondisi                              |
|--------------------|-------------|--------------------------------------|
| `VALIDATION_ERROR` | 400         | Email atau password tidak disertakan |
| `UNAUTHORIZED`     | 401         | Email atau password salah            |
| `AuthRateLimitError` | 429       | Terlalu banyak percobaan login       |

---

#### 1.2 Logout

```
POST /auth/logout
```

**Autentikasi:** Wajib (JWT Bearer token)

**Request Body:** Tidak diperlukan

**Response 200:**

```json
{
  "success": true,
  "data": null,
  "message": "Logout successful"
}
```

---

#### 1.3 Get Current Admin

```
GET /auth/me
```

**Autentikasi:** Wajib (JWT Bearer token)

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

**Autentikasi:** Wajib (JWT Bearer token)

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
        "patient": {
          "id": 6,
          "patientId": "P-006",
          "name": "Reka"
        }
      }
    ],
    "chartData": [
      {
        "hour": "08:00",
        "avgBpm": 82,
        "avgSpo2": 97,
        "readingCount": 5
      }
    ],
    "timestamp": "2026-07-29T10:30:00.000Z"
  },
  "message": "Dashboard data retrieved"
}
```

**Struktur Data:**

| Field                                    | Tipe    | Deskripsi                                                      |
|------------------------------------------|---------|----------------------------------------------------------------|
| `totalPatients`                          | number  | Jumlah total pasien                                            |
| `statusDistribution.normal`              | number  | Jumlah pasien dengan status Normal (latest reading)            |
| `statusDistribution.waspada`             | number  | Jumlah pasien dengan status Waspada                            |
| `statusDistribution.darurat`             | number  | Jumlah pasien dengan status Darurat                            |
| `statusDistribution.tanpaData`           | number  | Jumlah pasien tanpa readings sama sekali                       |
| `averages.avgBpm`                        | number  | Rata-rata BPM                                                  |
| `averages.avgSpo2`                       | number  | Rata-rata SpO₂                                                 |
| `averages.totalReadings`                 | number  | Total pembacaan yang digunakan untuk kalkulasi rata-rata       |
| `averages.range`                         | string  | Rentang waktu data: `24h`, `168h` (7 hari), `all`, atau `none` |
| `last10Readings[]`                       | array   | 10 pembacaan terbaru (dengan data pasien)                      |
| `chartData[].hour`                       | string  | Jam (format HH:00)                                             |
| `chartData[].avgBpm`                     | number  | Rata-rata BPM per jam                                          |
| `chartData[].avgSpo2`                    | number  | Rata-rata SpO₂ per jam                                         |
| `chartData[].readingCount`              | number  | Jumlah pembacaan per jam                                       |

---

### 3. Patients

Semua endpoint Patient memerlukan autentikasi.

#### 3.1 List Patients

```
GET /patients?page=1&limit=10&search=budi
```

**Query Parameters:**

| Parameter | Tipe    | Wajib | Default | Deskripsi                          |
|-----------|---------|-------|---------|------------------------------------|
| `page`    | number  | Tidak | 1       | Halaman                            |
| `limit`   | number  | Tidak | 10      | Jumlah item per halaman (max 100)  |
| `search`  | string  | Tidak | -       | Cari berdasarkan nama atau ID      |

**Response 200:**

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
        "doctorNote": "Kontrol rutin tekanan darah dan gula darah",
        "createdAt": "2026-07-07T00:00:00.000Z",
        "updatedAt": "2026-07-07T00:00:00.000Z",
        "readings": [
          {
            "status": "NORMAL",
            "bpm": 90,
            "spo2": 97,
            "createdAt": "2026-07-07T10:30:00.000Z"
          }
        ],
        "_count": {
          "readings": 10
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "totalPages": 1
    }
  },
  "message": "Patients retrieved"
}
```

---

#### 3.2 Get Patient Detail

```
GET /patients/:id
```

**Path Parameters:**

| Parameter | Tipe   | Wajib | Deskripsi          |
|-----------|--------|-------|--------------------|
| `id`      | number | Ya    | ID pasien (integer)|

**Response 200:**

```json
{
  "success": true,
  "data": {
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
    "doctorNote": "Kontrol rutin tekanan darah dan gula darah",
    "createdAt": "2026-07-07T00:00:00.000Z",
    "updatedAt": "2026-07-07T00:00:00.000Z",
    "readings": [ ... ],
    "sessions": [ ... ],
    "_count": {
      "readings": 10
    }
  },
  "message": "Patient retrieved"
}
```

**Error Codes:**

| Kode           | HTTP Status | Kondisi                 |
|----------------|-------------|-------------------------|
| `VALIDATION_ERROR` | 400    | ID pasien tidak valid   |
| `NOT_FOUND`    | 404         | Pasien tidak ditemukan  |

---

#### 3.3 Create Patient

```
POST /patients
```

**Request Body:**

```json
{
  "name": "Siti Rahmawati",
  "nik": "3201256712900002",
  "gender": "P",
  "birthDate": "1990-12-27",
  "address": "Jl. Braga No. 25, Bandung",
  "phone": "081298765432",
  "bloodType": "A",
  "height": 158,
  "weight": 55,
  "medicalHistory": "Asma bronkial",
  "doctorNote": "Hindari pemicu asma"
}
```

**Validasi Field:**

| Field            | Tipe    | Wajib | Validasi                                   |
|------------------|---------|-------|--------------------------------------------|
| `name`           | string  | Ya    | Minimal 2 karakter                         |
| `nik`            | string  | Tidak | 16 digit angka, unique                     |
| `gender`         | string  | Ya    | `L` atau `P`                               |
| `birthDate`      | string  | Ya    | Format ISO 8601 (YYYY-MM-DD)               |
| `address`        | string  | Tidak | -                                          |
| `phone`          | string  | Tidak | -                                          |
| `bloodType`      | string  | Tidak | `A`, `B`, `AB`, atau `O`                   |
| `height`         | number  | Tidak | 50–250 cm                                  |
| `weight`         | number  | Tidak | 2–300 kg                                   |
| `medicalHistory` | string  | Tidak | -                                          |
| `doctorNote`     | string  | Tidak | -                                          |

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": 6,
    "patientId": "P-006",
    "name": "Siti Rahmawati",
    ...
  },
  "message": "Patient created successfully"
}
```

---

#### 3.4 Update Patient

```
PUT /patients/:id
```

**Path Parameters:**

| Parameter | Tipe   | Wajib | Deskripsi          |
|-----------|--------|-------|--------------------|
| `id`      | number | Ya    | ID pasien (integer)|

**Request Body:** (Partial update — semua field opsional)

```json
{
  "name": "Siti Rahmawati Updated",
  "phone": "0812111222333"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Patient updated successfully"
}
```

---

#### 3.5 Delete Patient

```
DELETE /patients/:id
```

**Path Parameters:**

| Parameter | Tipe   | Wajib | Deskripsi          |
|-----------|--------|-------|--------------------|
| `id`      | number | Ya    | ID pasien (integer)|

**Response 200:**

```json
{
  "success": true,
  "data": null,
  "message": "Patient deleted successfully"
}
```

**Catatan:** Operasi delete akan menghapus semua data terkait (readings, sessions, audit logs) secara cascading.

---

### 4. Monitoring

Semua endpoint Monitoring memerlukan autentikasi.

#### 4.1 Get Active Monitoring

```
GET /monitoring
```

Mengembalikan semua sesi monitoring yang aktif beserta pembacaan terbaru.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "patientId": 1,
        "status": "ACTIVE",
        "startTime": "2026-07-07T09:30:00.000Z",
        "endTime": null,
        "notes": "Pasien dalam observasi tekanan darah",
        "createdAt": "2026-07-07T09:30:00.000Z",
        "patient": {
          "id": 1,
          "patientId": "P-001",
          "name": "Budi Santoso",
          "gender": "L",
          "age": 45
        },
        "readings": [
          {
            "id": 10,
            "bpm": 90,
            "spo2": 97,
            "bpmStatus": "NORMAL",
            "spo2Status": "NORMAL",
            "status": "NORMAL",
            "createdAt": "2026-07-07T10:30:00.000Z"
          }
        ],
        "_count": {
          "readings": 10
        }
      }
    ],
    "totalActive": 3
  },
  "message": "Active monitoring data retrieved"
}
```

---

#### 4.2 Get Realtime Data

```
GET /monitoring/realtime
```

Mengembalikan data terbaru untuk setiap pasien yang memiliki pembacaan.

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "patient": {
        "id": 1,
        "patientId": "P-001",
        "name": "Budi Santoso",
        "gender": "L",
        "age": 45
      },
      "latestReading": {
        "id": 10,
        "bpm": 90,
        "spo2": 97,
        "bpmStatus": "NORMAL",
        "spo2Status": "NORMAL",
        "status": "NORMAL",
        "createdAt": "2026-07-07T10:30:00.000Z",
        "sessionId": 1
      },
      "activeSessionId": 1,
      "isMonitoring": true
    }
  ],
  "message": "Realtime data retrieved"
}
```

---

#### 4.3 Get Monitoring History

```
GET /monitoring/history?page=1&limit=20&startDate=2026-07-01&endDate=2026-07-07&status=NORMAL&patientId=1
```

**Query Parameters:**

| Parameter    | Tipe    | Wajib | Default | Deskripsi                                        |
|-------------|---------|-------|---------|--------------------------------------------------|
| `page`       | number  | Tidak | 1       | Halaman                                          |
| `limit`      | number  | Tidak | 20      | Item per halaman (max 200)                       |
| `startDate`  | string  | Tidak | -       | Filter tanggal awal (ISO 8601)                   |
| `endDate`    | string  | Tidak | -       | Filter tanggal akhir (ISO 8601)                  |
| `status`     | string  | Tidak | -       | Filter status: `NORMAL`, `WASPADA`, `DARURAT`    |
| `patientId`  | number  | Tidak | -       | Filter ID pasien                                 |
| `bpmStatus`  | string  | Tidak | -       | Filter status BPM (lihat tabel di bawah)         |
| `spo2Status` | string  | Tidak | -       | Filter status SpO₂ (lihat tabel di bawah)        |

**Status BPM valid:** `BRADICARDIA`, `NORMAL`, `TACHY_RINGAN`, `TACHY_BERAT`

**Status SpO₂ valid:** `NORMAL`, `HIPOKSEMIA_RINGAN`, `HIPOKSEMIA_SEDANG`, `HIPOKSEMIA_BERAT`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "patientId": 1,
        "bpm": 85,
        "spo2": 98,
        "bpmStatus": "NORMAL",
        "spo2Status": "NORMAL",
        "status": "NORMAL",
        "sessionId": 1,
        "createdAt": "2026-07-07T09:30:00.000Z",
        "patient": {
          "id": 1,
          "patientId": "P-001",
          "name": "Budi Santoso",
          "gender": "L",
          "age": 45
        },
        "session": {
          "id": 1,
          "status": "ACTIVE",
          "startTime": "2026-07-07T09:30:00.000Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  },
  "message": "History retrieved"
}
```

---

### 5. Reports

Semua endpoint Reports memerlukan autentikasi.

#### 5.1 Get Daily Report

```
GET /reports/daily?startDate=2026-07-01&endDate=2026-07-07
```

**Query Parameters:**

| Parameter   | Tipe   | Wajib | Default                       | Deskripsi                |
|------------|--------|-------|-------------------------------|--------------------------|
| `startDate` | string | Tidak | 30 hari yang lalu             | Tanggal awal (ISO 8601)  |
| `endDate`   | string | Tidak | Hari ini                      | Tanggal akhir (ISO 8601) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2026-07-01T00:00:00.000Z",
      "end": "2026-07-07T23:59:59.000Z"
    },
    "summary": {
      "totalReadings": 500,
      "normalCount": 350,
      "waspadaCount": 100,
      "daruratCount": 50
    },
    "daily": [
      {
        "date": "2026-07-01",
        "totalReadings": 80,
        "normalCount": 60,
        "waspadaCount": 15,
        "daruratCount": 5,
        "avgBpm": 78,
        "avgSpo2": 97
      }
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

**Query Parameters:**

| Parameter | Tipe   | Wajib | Default | Deskripsi          |
|-----------|--------|-------|---------|--------------------|
| `year`    | number | Tidak | 2026    | Tahun (2000–2100)  |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "year": 2026,
    "summary": {
      "totalReadings": 500,
      "totalPatients": 5
    },
    "monthly": [
      {
        "month": 7,
        "year": 2026,
        "totalReadings": 500,
        "uniquePatients": 5,
        "normalCount": 350,
        "waspadaCount": 100,
        "daruratCount": 50,
        "avgBpm": 85,
        "avgSpo2": 96
      }
    ]
  },
  "message": "Monthly report generated"
}
```

---

#### 5.3 Export PDF

```
GET /reports/export/pdf?type=daily&startDate=2026-07-01&endDate=2026-07-07
```

**Query Parameters:**

| Parameter   | Tipe   | Wajib | Default       | Deskripsi                      |
|------------|--------|-------|---------------|--------------------------------|
| `type`      | string | Tidak | `daily`       | Tipe laporan (`daily`/`monthly`) |
| `startDate` | string | Tidak | 30 hari lalu  | Tanggal awal                   |
| `endDate`   | string | Tidak | Hari ini      | Tanggal akhir                  |

**Response:** `application/pdf` (file download)

PDF berisi:
- Judul laporan
- Periode laporan
- Ringkasan statistik (total readings, distribusi status)
- Tabel detail pembacaan (waktu, pasien, BPM, SpO₂, status)

---

#### 5.4 Export Excel

```
GET /reports/export/excel?startDate=2026-07-01&endDate=2026-07-07
```

**Query Parameters:**

| Parameter   | Tipe   | Wajib | Default       | Deskripsi     |
|------------|--------|-------|---------------|---------------|
| `startDate` | string | Tidak | 30 hari lalu  | Tanggal awal  |
| `endDate`   | string | Tidak | Hari ini      | Tanggal akhir |

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (file download .xlsx)

Excel berisi 2 sheet:
1. **Summary** — Ringkasan statistik (periode, total readings, distribusi status)
2. **Readings** — Tabel detail pembacaan (date/time, patient ID, name, gender, age, BPM, SpO₂, status)

---

### 6. Settings

Semua endpoint Settings memerlukan autentikasi.

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
      {
        "id": 1,
        "key": "min_bpm",
        "value": "60",
        "description": "Batas bawah BPM normal",
        "updatedAt": "2026-07-07T00:00:00.000Z"
      },
      {
        "id": 2,
        "key": "max_bpm",
        "value": "100",
        "description": "Batas atas BPM normal",
        "updatedAt": "2026-07-07T00:00:00.000Z"
      },
      {
        "id": 3,
        "key": "min_spo2",
        "value": "95",
        "description": "Batas bawah SpO₂ normal",
        "updatedAt": "2026-07-07T00:00:00.000Z"
      },
      {
        "id": 4,
        "key": "max_spo2",
        "value": "100",
        "description": "Batas atas SpO₂ normal",
        "updatedAt": "2026-07-07T00:00:00.000Z"
      }
    ],
    "map": {
      "min_bpm": "60",
      "max_bpm": "100",
      "min_spo2": "95",
      "max_spo2": "100"
    }
  },
  "message": "Settings retrieved"
}
```

**Daftar Setting Keys yang Valid:**

| Key                    | Default | Deskripsi                               |
|------------------------|---------|-----------------------------------------|
| `min_bpm`              | 60      | Batas bawah BPM normal                  |
| `max_bpm`              | 100     | Batas atas BPM normal                   |
| `min_spo2`             | 95      | Batas bawah SpO₂ normal                 |
| `max_spo2`             | 100     | Batas atas SpO₂ normal                  |
| `alert_bpm_high`       | -       | Ambang peringatan BPM tinggi            |
| `alert_bpm_low`        | -       | Ambang peringatan BPM rendah            |
| `alert_spo2_low`       | -       | Ambang peringatan SpO₂ rendah           |
| `monitoring_interval`  | -       | Interval pengiriman data (detik)        |
| `auto_session_timeout` | -       | Timeout sesi otomatis (menit)           |
| `custom_*`             | -       | Setting kustom (diawali `custom_`)      |

---

#### 6.2 Update Settings

```
PUT /settings
```

**Request Body:**

```json
{
  "min_bpm": "60",
  "max_bpm": "100",
  "min_spo2": "95",
  "max_spo2": "100",
  "alert_bpm_high": "120",
  "alert_bpm_low": "50",
  "alert_spo2_low": "90",
  "monitoring_interval": "5",
  "auto_session_timeout": "30"
}
```

**Validasi:**

- Semua nilai numerik harus berupa string angka positif
- `min_bpm`: 30–200
- `max_bpm`: 30–250
- `min_spo2` / `max_spo2`: 50–100
- `min_bpm` harus kurang dari `max_bpm`
- `min_spo2` harus kurang dari `max_spo2`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "updated": 3,
    "changes": [
      {
        "key": "min_bpm",
        "oldValue": "50",
        "newValue": "60"
      }
    ]
  },
  "message": "3 setting(s) updated successfully"
}
```

---

### 7. Health Check

```
GET /health
```

**Autentikasi:** Tidak diperlukan

**Response 200:**

```json
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

---

## Socket.IO Events

### Koneksi

```javascript
// Frontend — Koneksi dengan token JWT
const socket = io('http://localhost:5000', {
  auth: { token: 'Bearer <jwt-token>' }
});

// Frontend — Koneksi tanpa autentikasi
const socket = io('http://localhost:5000');

// ESP32 — Koneksi dengan deviceId dan apiKey
const socket = io('http://{server-ip}:5000', {
  auth: { deviceId: 'ESP32-ALPHA-001', apiKey: 'a1b2c3d4...' }
});
```

### Events: ESP32 → Server

#### `esp32:reading`

Dikirim oleh perangkat ESP32 untuk mengirim data vital sign.

**Payload:**

```json
{
  "deviceId": "ESP32-ALPHA-001",
  "apiKey": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "patientId": 1,
  "bpm": 85,
  "spo2": 98,
  "sessionId": 1
}
```

| Field       | Tipe   | Wajib | Deskripsi                           |
|-------------|--------|-------|-------------------------------------|
| `deviceId`  | string | Ya    | ID unik perangkat ESP32             |
| `apiKey`    | string | Ya    | API key perangkat (SHA-256 hash)    |
| `patientId` | number | Ya    | ID pasien yang dipantau             |
| `bpm`       | number | Ya    | Denyut jantung (30–250)             |
| `spo2`      | number | Ya    | Saturasi oksigen (50–100)            |
| `sessionId` | number | Tidak | ID sesi (auto-created jika kosong)  |

**Response (Acknowledgment):**

```json
{
  "readingId": 51,
  "status": "NORMAL"
}
```

**Error Response:**

```json
{
  "message": "Missing required fields: deviceId, apiKey, patientId, bpm, spo2"
}
```

### Events: Server → Client

#### `monitoring:update`

Dikirim ke semua admin client ketika ada pembacaan baru.

**Payload:**

```json
{
  "type": "new_reading",
  "reading": {
    "id": 51,
    "patientId": 1,
    "sessionId": 1,
    "bpm": 85,
    "spo2": 98,
    "bpmStatus": "NORMAL",
    "spo2Status": "NORMAL",
    "status": "NORMAL",
    "createdAt": "2026-07-07T10:30:00.000Z",
    "patient": {
      "id": 1,
      "patientId": "P-001",
      "name": "Budi Santoso"
    }
  }
}
```

#### `monitoring:alert`

Dikirim ke semua admin client ketika ada pembacaan yang melampaui ambang batas.

**Payload:**

```json
{
  "patientId": 3,
  "patientName": "Ahmad Hidayat",
  "reading": {
    "bpm": 130,
    "spo2": 85,
    "bpmStatus": "TACHY_BERAT",
    "spo2Status": "HIPOKSEMIA_SEDANG",
    "status": "DARURAT"
  },
  "message": "BPM 130 di atas batas normal (100)",
  "timestamp": "2026-07-07T10:30:00.000Z"
}
```

#### `monitoring:status`

Dapat digunakan untuk mengirim status koneksi atau informasi lain.

### Events: Client → Server (Subscription)

#### `subscribe:patient`

Berlangganan (subscribe) ke pembaruan pasien tertentu.

**Payload:**

```json
{
  "patientId": 1
}
```

**Response:**

```json
{
  "patientId": 1
}
```

#### `unsubscribe:patient`

Berhenti berlangganan dari pasien tertentu.

**Payload:**

```json
{
  "patientId": 1
}
```

**Response:**

```json
{
  "patientId": 1
}
```

---

## Status Thresholds

### BPM Status

| Rentang      | Status          | Keterangan              |
|-------------|-----------------|-------------------------|
| < 60        | `BRADICARDIA`   | Denyut lambat           |
| 60 – 100    | `NORMAL`        | Normal                  |
| 101 – 120   | `TACHY_RINGAN`  | Takikardia ringan       |
| > 120       | `TACHY_BERAT`   | Takikardia berat        |

### SpO₂ Status

| Rentang    | Status               | Keterangan              |
|------------|----------------------|-------------------------|
| ≥ 95       | `NORMAL`             | Normal                  |
| 90 – 94    | `HIPOKSEMIA_RINGAN`  | Hipoksemia ringan       |
| 85 – 89    | `HIPOKSEMIA_SEDANG`  | Hipoksemia sedang       |
| < 85       | `HIPOKSEMIA_BERAT`   | Hipoksemia berat        |

### Composite Status

| Kondisi                                                      | Status    |
|--------------------------------------------------------------|-----------|
| BPM Normal DAN SpO₂ Normal                                   | `NORMAL`  |
| Bradikardia ATAU Takikardia Berat ATAU Hipoksemia Sedang/Berat | `DARURAT` |
| Selain kondisi di atas                                       | `WASPADA` |

---

## Rate Limiting

| Endpoint              | Window  | Max Requests | Header Response                  |
|-----------------------|---------|--------------|----------------------------------|
| Global (`/api/`)      | 15 menit | 200         | `RateLimit-*`                    |
| Auth (`/auth/login`)  | 15 menit | 20          | `RateLimit-*`                    |

Header respons menyertakan informasi rate limit:

```
RateLimit-Limit: 200
RateLimit-Remaining: 195
RateLimit-Reset: 1625640000
```

---

## Catatan Penting

1. **Format Tanggal:** Semua tanggal menggunakan format ISO 8601.
2. **Pagination:** Selalu gunakan pagination untuk endpoint yang mengembalikan banyak data.
3. **Token Blacklist:** Token yang di-logout tidak dapat digunakan kembali.
4. **ESP32 Auth:** Perangkat ESP32 diautentikasi menggunakan API key yang dicocokkan dengan hash SHA-256 di database.
5. **Audit Trail:** Semua operasi CRUD pada pasien dan pengaturan dicatat dalam tabel audit log.
