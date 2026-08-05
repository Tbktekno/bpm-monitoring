# Database — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan schema database, Entity-Relationship Diagram, dan data seed.

---

## Daftar Isi

- [Teknologi Database](#teknologi-database)
- [Daftar Model](#daftar-model)
- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Deskripsi Model](#deskripsi-model)
- [Index & Optimasi](#index--optimasi)
- [Data Seed](#data-seed)
- [Manajemen Database](#manajemen-database)

---

## Teknologi Database

| Lingkungan | Provider | Koneksi |
|------------|----------|---------|
| Development | SQLite | `DATABASE_URL="file:./dev.db"` |
| Production | PostgreSQL | `DATABASE_URL="postgresql://user:pass@host:5432/db"` |

Schema didefinisikan di `backend/prisma/schema.prisma` dan dikelola dengan **Prisma ORM**.

**Mengganti ke PostgreSQL (production):**
1. Ubah `DATABASE_URL` di `.env` ke connection string PostgreSQL.
2. Ubah `provider` di `prisma/schema.prisma` dari `sqlite` ke `postgresql`.
3. Jalankan `npx prisma db push` (atau `npx prisma migrate deploy`).

---

## Daftar Model

Terdapat **7 model**:

| Model | Tabel | Deskripsi |
|-------|-------|-----------|
| `Admin` | `Admin` | Akun admin/petugas |
| `Patient` | `Patient` | Data pasien |
| `Reading` | `Reading` | Pembacaan vital sign |
| `MonitoringSession` | `MonitoringSession` | Sesi monitoring |
| `Setting` | `Setting` | Konfigurasi key-value |
| `Esp32Device` | `Esp32Device` | Perangkat ESP32/ESP8266 |
| `AuditLog` | `AuditLog` | Log aktivitas admin |

---

## Entity Relationship Diagram

```
┌─────────────────┐        ┌──────────────────────┐
│      Admin      │        │       Patient         │
├─────────────────┤        ├──────────────────────┤
│ id (PK)         │        │ id (PK)              │
│ name            │        │ patientId (UK)        │  ← P-001, P-002...
│ email (UK)      │        │ name                 │
│ passwordHash    │        │ nik (UK)             │  ← encrypted at rest
│ createdAt       │        │ gender               │  ← L / P
│ updatedAt       │        │ birthDate            │
└───────┬─────────┘        │ age                  │  ← computed
        │ 1                │ address / phone      │
        │                  │ bloodType            │  ← A, B, AB, O
        │                  │ height / weight      │
        ▼                  │ medicalHistory       │  ← encrypted at rest
┌─────────────────┐        │ doctorNote           │
│    AuditLog     │        │ createdAt / updatedAt│
├─────────────────┤        └──────────┬───────────┘
│ id (PK)         │                   │ 1
│ adminId (FK)────┼───────┐           │
│ patientId (FK)──┼────┐  │           ▼
│ action          │    │  │  ┌──────────────────────┐
│ details         │    │  │  │  MonitoringSession   │
│ ipAddress       │    │  │  ├──────────────────────┤
│ createdAt       │    │  │  │ id (PK)              │
└─────────────────┘    │  │  │ patientId (FK) ───────┼──┐
                       │  │  │ deviceId             │  │ (String?, optional)
                       │  │  │ status               │  │  ACTIVE/COMPLETED/CANCELLED
                       │  │  │ startTime / endTime  │  │
                       │  │  │ notes / createdAt    │  │
                       │  └──┼──────────────────────┼──┘
                       │      └──────────┬───────────┘
                       │                 │ 1
┌─────────────────┐    │                 │
│  Esp32Device    │    │                 ▼
├─────────────────┤    │  ┌──────────────────────────┐
│ id (PK)         │    │  │        Reading            │
│ deviceId (UK)   │    │  ├──────────────────────────┤
│ apiKey          │    │  │ id (PK)                  │
│ label           │    │  │ patientId (FK, null) ─────┼───┐
│ isActive        │    │  │ bpm                      │   │ (opsional)
│ createdAt       │    │  │ spo2                     │   │
│ updatedAt       │    │  │ bpmStatus                │   │
└─────────────────┘    │  │ spo2Status               │   │
                       │  │ status                   │   │
                       │  │ sessionId (FK, null) ─────┼───┘
                       │  │ createdAt                │
                       │  └──────────────────────────┘
┌─────────────────┐    │
│     Setting     │    │
├─────────────────┤    │
│ id (PK)         │    │
│ key (UK)        │    │
│ value           │    │
│ description     │    │
│ updatedAt       │    │
└─────────────────┘    │
                       │
Relasi tambahan (tidak digambar di atas):
- Patient 1 ── N Reading
- Patient 1 ── N MonitoringSession
- MonitoringSession 1 ── N Reading
- Admin 1 ── N AuditLog
- Patient 1 ── N AuditLog
```

---

## Deskripsi Model

### 1. Admin

Akun admin yang dapat login ke dashboard.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID |
| `name` | String | Required | Nama admin |
| `email` | String | Unique | Email login |
| `passwordHash` | String | Required | Hash bcrypt (12 rounds) |
| `createdAt` | DateTime | default now | Waktu dibuat |
| `updatedAt` | DateTime | auto | Waktu diupdate |

**Relasi:** `auditLogs AuditLog[]`

---

### 2. Patient

Data pasien yang dimonitor.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID internal |
| `patientId` | String | Unique | ID pasien (format `P-XXX`) |
| `name` | String | Required | Nama pasien |
| `nik` | String? | Unique | NIK (encrypted at rest) |
| `gender` | String | Required | `L` / `P` |
| `birthDate` | DateTime | Required | Tanggal lahir |
| `age` | Int | Computed | Usia (dihitung saat insert/update) |
| `address` | String? | - | Alamat |
| `phone` | String? | - | No. telepon |
| `bloodType` | String? | - | `A`, `B`, `AB`, `O` |
| `height` | Float? | - | Tinggi (cm) |
| `weight` | Float? | - | Berat (kg) |
| `medicalHistory` | String? | - | Riwayat medis (encrypted at rest) |
| `doctorNote` | String? | - | Catatan dokter |
| `createdAt` / `updatedAt` | DateTime | - | Timestamp |

**Relasi:** `readings`, `sessions`, `auditLogs`.

---

### 3. Reading (Vital Sign)

Satu baris = satu pembacaan BPM + SpO₂.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID |
| `patientId` | Int? | FK → Patient.id | Pasien (opsional) |
| `bpm` | Int | Required | Denyut jantung |
| `spo2` | Int | Required | Saturasi oksigen |
| `bpmStatus` | String | Required | `BRADICARDIA`, `NORMAL`, `TACHY_RINGAN`, `TACHY_BERAT` |
| `spo2Status` | String | Required | `NORMAL`, `HIPOKSEMIA_RINGAN`, `HIPOKSEMIA_SEDANG`, `HIPOKSEMIA_BERAT` |
| `status` | String | Required, indexed | `NORMAL`, `WASPADA`, `DARURAT` |
| `sessionId` | Int? | FK → MonitoringSession.id | Sesi terkait (opsional) |
| `createdAt` | DateTime | default now, indexed | Waktu pembacaan |

**Relasi:** `patient Patient?`, `session MonitoringSession?`

---

### 4. MonitoringSession

Sesi monitoring untuk satu pasien + device.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID sesi |
| `patientId` | Int | FK → Patient.id | Pasien |
| `deviceId` | String? | indexed | Device yang dipakai (opsional) |
| `status` | String | default `ACTIVE` | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `startTime` | DateTime | default now | Waktu mulai |
| `endTime` | DateTime? | - | Waktu selesai |
| `notes` | String? | - | Catatan |
| `createdAt` | DateTime | default now | Timestamp |

**Relasi:** `patient Patient`, `readings Reading[]`

---

### 5. Setting

Konfigurasi key-value sistem.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK | ID |
| `key` | String | Unique | Key setting |
| `value` | String | Required | Nilai |
| `description` | String? | - | Deskripsi |
| `updatedAt` | DateTime | auto | Timestamp update |

**Setting keys:** `min_bpm`, `max_bpm`, `min_spo2`, `max_spo2`, `alert_bpm_high`, `alert_bpm_low`, `alert_spo2_low`, `monitoring_interval`, `auto_session_timeout`, dan key `custom_*`.

---

### 6. Esp32Device

Perangkat IoT terdaftar.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID |
| `deviceId` | String | Unique | ID unik perangkat |
| `apiKey` | String | Required | Hash SHA-256 dari API key |
| `label` | String? | - | Label/lokasi |
| `isActive` | Boolean | default true | Status aktif |
| `createdAt` / `updatedAt` | DateTime | - | Timestamp |

---

### 7. AuditLog

Catatan aktivitas admin.

| Field | Tipe | Constraints | Deskripsi |
|-------|------|-------------|-----------|
| `id` | Int | PK, auto-increment | ID |
| `adminId` | Int | FK → Admin.id | Admin |
| `patientId` | Int? | FK → Patient.id | Pasien (opsional) |
| `action` | String | Required | `VIEW`, `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT` |
| `details` | String? | - | Detail |
| `ipAddress` | String? | - | IP asal |
| `createdAt` | DateTime | default now, indexed | Waktu |

---

## Index & Optimasi

| Model | Index | Tujuan |
|-------|-------|--------|
| `Reading` | `(patientId, createdAt)` | Query riwayat per pasien |
| `Reading` | `status` | Filter status |
| `Reading` | `createdAt` | Rentang tanggal |
| `MonitoringSession` | `(patientId, startTime)` | Query sesi per pasien |
| `MonitoringSession` | `deviceId` | Cari sesi aktif per device |
| `AuditLog` | `createdAt`, `adminId`, `patientId` | Filter log |

---

## Data Seed

File: `backend/prisma/seed.ts`. Menghapus semua data lalu mengisi:

| Data | Jumlah | Catatan |
|------|--------|---------|
| Admin | 1 | `admin@monitoring-bpm.web.id` / `Admin123!` |
| Settings | 4 | `min_bpm=60`, `max_bpm=100`, `min_spo2=95`, `max_spo2=100` |
| Pasien | 6 | P-001 s/d P-006 (profil medis berbeda-beda) |
| Sesi | 6 | Sesi 4 & 6 berstatus `COMPLETED`, sisanya `ACTIVE` |
| Reading | 60 | 10 reading per sesi (kondisi klinis bervariasi) |
| ESP32 device | 3 | ALPHA/BETA/GAMMA (GAMMA nonaktif) |

**Device seed:**

| Device ID | API Key plaintext | Label | Aktif |
|-----------|-------------------|-------|-------|
| `ESP32-ALPHA-001` | `bpm-sample-alpha-key-001` | Ruang Observasi 1 | ✅ |
| `ESP32-BETA-002` | `bpm-sample-beta-key-002` | Ruang IGD | ✅ |
| `ESP32-GAMMA-003` | `bpm-sample-gamma-key-003` | Ruang Perawatan 2 | ❌ |

> API key di database tersimpan sebagai **hash SHA-256**, bukan plaintext.

**Profil klinis pasien seed:**

| Pasien | Kondisi |
|--------|---------|
| P-001 Budi Santoso | Hipertensi — BPM cenderung tinggi, SpO₂ normal |
| P-002 Siti Rahmawati | Asma — BPM agak tinggi, SpO₂ bervariasi |
| P-003 Ahmad Hidayat | PJK — BPM takikardia, SpO₂ rendah (episode DARURAT) |
| P-004 Dewi Sartika | Anemia — BPM cepat, SpO₂ agak rendah |
| P-005 Eko Prasetyo | Sehat — semua reading NORMAL |
| P-006 Reka | BPM bervariasi, SpO₂ cenderung rendah |

---

## Manajemen Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Push schema ke database (dev)
npx prisma db push

# Seed data contoh
npm run db:seed

# Reset database + seed
npm run db:reset

# GUI database
npx prisma studio        # http://localhost:5555
```

### Pembersihan Data Monitoring
Endpoint `DELETE /api/v1/settings/data` menghapus semua `Reading`, `MonitoringSession`, `AuditLog` tetapi **menjaga** `Esp32Device`, `Admin`, dan `Setting`.

---

## Lanjutkan Membaca

- [Arsitektur](architecture.md)
- [REST API](api.md)
- [Setup](setup.md)
