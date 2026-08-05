# Keamanan — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan arsitektur keamanan sistem: autentikasi, otorisasi, enkripsi, rate limiting, dan praktik keamanan lainnya.

---

## Daftar Isi

- [Prinsip Keamanan](#prinsip-keamanan)
- [Autentikasi Admin (JWT)](#autentikasi-admin-jwt)
- [Autentikasi Device (API Key)](#autentikasi-device-api-key)
- [Lapisan Keamanan](#lapisan-keamanan)
- [Enkripsi Data Sensitif](#enkripsi-data-sensitif)
- [Rate Limiting](#rate-limiting)
- [Audit Trail](#audit-trail)
- [Praktik Keamanan](#praktik-keamanan)
- [Checklist Production](#checklist-production)

---

## Prinsip Keamanan

1. **Security by Design** — autentikasi, validasi, dan logging diterapkan sejak awal.
2. **Defense in Depth** — beberapa lapisan perlindungan (headers, CORS, rate limit, auth, validasi).
3. **Least Privilege** — endpoint device dan admin terpisah dengan kredensial berbeda.
4. **Never Store Plaintext Secrets** — password (bcrypt), API key (SHA-256).

---

## Autentikasi Admin (JWT)

### Alur Login

```
POST /auth/login { email, password }
  1. Validasi email & password wajib ada
  2. Cari admin by email
  3. bcrypt.compare(password, admin.passwordHash)
  4. jwt.sign({ adminId, email }, JWT_SECRET, { expiresIn })
  5. Catat AuditLog (LOGIN)
  6. Return { token, admin }
```

### Spesifikasi Token

| Atribut | Nilai |
|---------|-------|
| Algorithm | HS256 |
| Secret | `JWT_SECRET` (min 64 karakter di production) |
| Issuer | `JWT_ISSUER` (default `bpm-monitoring`) |
| Expiry default | 24 jam |
| Expiry remember-me | 7 hari |
| Refresh token (helper) | 7 hari default / 30 hari remember-me |

### Verifikasi Token (`server/middleware/auth.ts`)

- Header `Authorization: Bearer <token>`.
- `jwt.verify(token, secret, { algorithms: ['HS256'], issuer })`.
- Cek blacklist token.
- Attach `req.admin` untuk controller.

### Blacklist Token (`shared/jwt.ts`)

- Token yang di-logout di-hash SHA-256 lalu dimasukkan ke Map in-memory.
- Entri otomatis dibersihkan setiap 15 menit (hanya yang sudah kedaluwarsa).
- **Catatan:** in-memory — gunakan Redis untuk multi-instance production.

---

## Autentikasi Device (API Key)

### HTTP Ingestion (`shared/esp32-http-auth.ts`)

Perangkat mengirim header:

```
x-device-id: ESP32-ALPHA-001
x-api-key: bpm-sample-alpha-key-001
```

Proses:
1. Validasi header ada & API key min 16 karakter.
2. Hash API key dengan **SHA-256**.
3. Query `Esp32Device` dengan `deviceId + apiKeyHash + isActive=true`.
4. Jika cocok → `req.device = { deviceId, label }`, lanjut.
5. Jika tidak → `401 AUTH_FAILED`.

**Error codes:**

| Code | Kondisi |
|------|---------|
| `MISSING_DEVICE_ID` | Header `x-device-id` tidak ada |
| `MISSING_API_KEY` | Header `x-api-key` tidak ada |
| `INVALID_API_KEY` | API key < 16 karakter |
| `AUTH_FAILED` | Device tidak cocok / nonaktif |
| `AUTH_UNAVAILABLE` | Error internal |

### Socket.IO Auth (`shared/esp32-auth-middleware.ts`)

- Jika koneksi punya JWT valid → admin.
- Jika punya `apiKey` → hash & cocokkan dengan `Esp32Device` (aktif) → device.
- Jika keduanya gagal → tolak koneksi.

---

## Lapisan Keamanan

| Lapisan | Teknologi | Konfigurasi |
|---------|-----------|-------------|
| Security headers | Helmet | CSP, noSniff, frameguard deny, XSS filter, HSTS 1 tahun, referrer policy, hidePoweredBy, dnsPrefetchControl off |
| CORS | cors | Origin terbatas, credentials true |
| Body limit | express.json | 1 MB |
| Rate limiting | express-rate-limit | Global 200/15menit, Auth 10/15menit |
| Autentikasi admin | JWT HS256 | Secret ≥ 64 char, issuer fixed |
| Autentikasi device | API key SHA-256 | Min 16 char, must be active |
| Password | bcryptjs | 12 rounds |
| Validasi input | Manual controller | Tipe, range, format |
| Error handling | Global handler | Pesan generik di production |
| Logging | Winston | File + console, rotate 5MB |
| Audit trail | AuditLog model | Semua aksi penting |

---

## Enkripsi Data Sensitif

| Field | Model | Metode |
|-------|-------|--------|
| `passwordHash` | Admin | bcrypt (one-way, 12 rounds) |
| `nik` | Patient | Encrypted at rest (AES-256 per schema) |
| `medicalHistory` | Patient | Encrypted at rest (AES-256 per schema) |
| `apiKey` | Esp32Device | SHA-256 hash (one-way) |

> ⚠ Schema menandai `nik` dan `medicalHistory` sebagai "encrypted at rest". Pastikan penerapan enkripsi ATS (Application Transparent Encryption) aktif di production sesuai kebijakan fasilitas kesehatan.

---

## Rate Limiting

| Endpoint | Window | Max (default) |
|----------|--------|---------------|
| Global `/api/` | 15 menit | 200 |
| Auth `/api/v1/auth/login` | 15 menit | 10 |
| (Config siap) `/api/v1/readings` | 1 menit | 60 |

Dikonfigurasi di `config/security.ts`:
```ts
globalRateLimit   // 200 / 15 menit — dipakai di app.use('/api/')
authRateLimit     // 10 / 15 menit — dipakai di /auth/login
esp32RateLimit    // 60 / 1 menit — tersedia untuk ingestion
```

Header respons: `RateLimit-*` (standard headers).

---

## Audit Trail

Semua aktivitas penting dicatat ke tabel `AuditLog`:

| Aksi | Dicatat saat |
|------|--------------|
| `LOGIN` | Admin login |
| `LOGOUT` | Admin logout |
| `CREATE` | Buat pasien/device |
| `UPDATE` | Update pasien/device/settings/threshold/password |
| `DELETE` | Hapus pasien/device |

Data yang tersimpan: `adminId`, `patientId` (opsional), `action`, `details`, `ipAddress`, `createdAt`.

---

## Praktik Keamanan

### Backend
- Semua endpoint admin memakai middleware `authenticate`.
- Validasi input ketat (BPM 30–250, SpO₂ 50–100, NIK 16 digit, dll).
- Password tidak pernah dikembalikan dalam respons.
- `rawApiKey` device hanya dikembalikan **sekali** saat create.

### Frontend
- Token disimpan di `localStorage`.
- Interceptor Axios menangani 401 → redirect login.
- Validasi form dengan Zod (client-side + server-side).

### Firmware
- API key dikirim plaintext (HTTP) — gunakan HTTPS/WSS & jaringan terisolasi di production.

---

## Checklist Production

- [ ] Ganti `JWT_SECRET` (≥ 64 karakter acak).
- [ ] Ganti password admin default.
- [ ] Aktifkan PostgreSQL (bukan SQLite).
- [ ] Atur `CORS_ORIGINS` eksplisit.
- [ ] Gunakan HTTPS (reverse proxy / nginx + TLS).
- [ ] Ganti API key seed device dengan key yang digenerate.
- [ ] Terapkan enkripsi ATS untuk `nik` & `medicalHistory`.
- [ ] Gunakan Redis untuk token blacklist (jika multi-instance).
- [ ] Isolasi jaringan IoT dari internet publik.
- [ ] Review & sesuaikan rate limit.
- [ ] Pantau log (`logs/error.log`) secara berkala.

---

## Lanjutkan Membaca

- [Arsitektur](architecture.md)
- [REST API](api.md)
- [Socket.IO / Real-Time](socketio.md)
- [Deployment](deployment.md)
