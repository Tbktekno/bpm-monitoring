# Socket.IO & Real-Time — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan komunikasi real-time menggunakan Socket.IO: koneksi, autentikasi, event, dan alur data.

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Koneksi](#koneksi)
- [Autentikasi Socket](#autentikasi-socket)
- [Rooms](#rooms)
- [Event](#event)
- [Payload Event](#payload-event)
- [Alur Broadcast](#alur-broadcast)
- [Frontend Socket Service](#frontend-socket-service)
- [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

Backend menjalankan Socket.IO server pada port yang sama dengan HTTP (`:5000`).

**Peran penting:** Data dari perangkat IoT masuk melalui **HTTP POST** (`POST /api/v1/readings/device`), lalu backend **menyiarkan** ke semua admin client via Socket.IO. Jadi Socket.IO dipakai untuk:
- Push pembacaan baru ke dashboard (`monitoring:update`).
- Push peringatan (`monitoring:alert`).
- Subscribe/unsubscribe pasien tertentu.

```
ESP8266 ──HTTP POST──▶ Backend ──Socket.IO emit──▶ Admin Dashboard
```

---

## Koneksi

### Frontend (Admin)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('token') },  // JWT
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
```

Token JWT dikirim melalui `handshake.auth.token` (atau bisa juga `handshake.query.token`).

### ESP32/ESP8266 (Device — legacy WebSocket)

```javascript
// Dulu memakai WebSocket; versi sekarang memakai HTTP POST
const socket = io('http://{server}:5000', {
  auth: { apiKey: 'bpm-sample-alpha-key-001' },
});
```

> ⚠ **Penting:** Versi firmware saat ini mengirim data via **HTTP POST** dengan header `x-api-key` & `x-device-id`. Lihat [Dokumentasi Firmware](firmware.md).

---

## Autentikasi Socket

Diterapkan pada middleware `io.use(esp32SocketAuthMiddleware)` (`src/shared/esp32-auth-middleware.ts`):

```
Koneksi masuk
  ├─ Punya JWT token valid?  → admin, izinkan (next)
  ├─ Punya apiKey?  → hash SHA-256 → cek Esp32Device (aktif) → izinkan sebagai device
  └─ Tidak keduanya → tolak ("Authentication required (token or API key)")
```

- Token JWT admin divalidasi dengan `jwt.verify(token, JWT_SECRET)`.
- API key device di-hash SHA-256 dan dicocokkan dengan kolom `apiKey` pada tabel `Esp32Device` (harus `isActive: true`).

---

## Rooms

```
Socket.IO Server
│
├── Admin Clients (JWT)
│   ├── room "admins"            ← menerima monitoring:update & monitoring:alert
│   └── room "patient:{id}"      ← menerima event spesifik pasien (subscribe)
│
└── Devices (apiKey)             ← (legacy WebSocket; data utama via HTTP)
```

- Admin yang terautentikasi otomatis `socket.join('admins')`.
- Admin dapat subscribe ke room pasien via `subscribe:patient`.

---

## Event

| Event | Arah | Pemicu | Penerima |
|-------|------|--------|----------|
| `monitoring:update` | Server → Admin | Reading baru tersimpan di database | room `admins` |
| `monitoring:alert` | Server → Admin | Threshold violation / status ≠ NORMAL | room `admins` |
| `subscribe:patient` | Admin → Server | Ingin menerima update pasien tertentu | Server |
| `unsubscribe:patient` | Admin → Server | Berhenti menerima update pasien | Server |
| `subscribed` | Server → Admin | Konfirmasi subscribe | Client yang subscribe |
| `unsubscribed` | Server → Admin | Konfirmasi unsubscribe | Client yang unsubscribe |
| `disconnect` | - | Client putus koneksi | Server |

> Event yang dulunya dipakai device (`esp32:reading`, `esp32:ack`, `esp32:error`) sudah **digantikan** oleh HTTP ingestion. Handler socket sekarang bersifat **admin-facing only**.

---

## Payload Event

### `monitoring:update`

Dikirim dari `readings.controller.ts` setelah reading tersimpan:

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
  },
  "deviceId": "ESP8266-ALPHA-001",
  "deviceLabel": "Ruang Observasi 1"
}
```

### `monitoring:alert`

Dikirim ketika nilai melampaui ambang batas ATAU status ≠ `NORMAL`:

```json
{
  "deviceId": "ESP8266-ALPHA-001",
  "deviceLabel": "Ruang Observasi 1",
  "reading": {
    "id": 52,
    "bpm": 130,
    "spo2": 85,
    "bpmStatus": "TACHY_BERAT",
    "spo2Status": "HIPOKSEMIA_SEDANG",
    "status": "DARURAT",
    "createdAt": "2026-07-07T10:30:00.000Z"
  },
  "message": "BPM 130 di atas batas normal (100)",
  "timestamp": "2026-07-07T10:30:00.000Z"
}
```

**Logika alert** (`isAlertThreshold`):
- BPM < `min_bpm` → "BPM ... di bawah batas normal (...)"
- BPM > `max_bpm` → "BPM ... di atas batas normal (...)"
- SpO₂ < `min_spo2` → "SpO₂ ...% di bawah batas normal (...)%"

Ambang batas diambil dari **threshold cache** (di-refresh dari tabel `Setting` setiap 5 menit).

### `subscribe:patient` / `unsubscribe:patient`

Request (Admin → Server):
```json
{ "patientId": 1 }
```

Response (Server → Admin):
```json
{ "patientId": 1 }
```
atau error:
```json
{ "message": "patientId is required" }
```

---

## Alur Broadcast

```
POST /api/v1/readings/device
        │
        ▼
  esp32HttpAuth (header)   ──→  401 jika gagal
        │
        ▼
  Validasi body (bpm 30-250, spo2 50-100)
        │
        ▼
  Cari MonitoringSession (deviceId + ACTIVE)
        │
        ▼
  calculateStatuses(bpm, spo2)
        │
        ▼
  prisma.reading.create(...)
        │
        ├──→ io.to('admins').emit('monitoring:update', { type, reading, deviceId, deviceLabel })
        │
        └──→ jika isAlertThreshold(bpm, spo2) ATAU status != NORMAL:
               io.to('admins').emit('monitoring:alert', { deviceId, deviceLabel, reading, message, timestamp })
        │
        ▼
  201 { readingId, status }
```

> Broadcast gagal (socket error) **tidak memblokir** respons — reading sudah tersimpan, error hanya di-log.

---

## Frontend Socket Service

`frontend/src/services/socket.service.ts` membungkus `socket.io-client` sebagai singleton:

| Method | Fungsi |
|--------|--------|
| `connect(token?)` | Koneksi ke server (reuse koneksi jika sudah aktif & token sama) |
| `disconnect()` | Putuskan koneksi & bersihkan listener |
| `on(event, cb)` | Daftarkan listener + **re-register otomatis saat reconnect** (mencegah event hilang setelah koneksi pulih) |
| `off(event, cb)` | Hapus listener |
| `emit(event, ...args)` | Kirim event |
| `isConnected()` | Cek status koneksi |

> Versi saat ini memperbaiki *reconnect churn*: koneksi yang masih disambungkan/aktif tidak dihancurkan berulang kali pada tiap `connect()`, dan listener diputar ulang (`attachAllListeners`) setelah koneksi pulih sehingga event real-time tidak pernah hilang.

**Hook pengguna** di halaman:

| Hook | Penggunaan |
|------|-----------|
| `useSocket()` | Akses `on`, `off`, `emit` dari komponen |
| `Monitoring.tsx` | Subscribe `monitoring:update` → update grafik real-time |
| `MonitoringDetail.tsx` | Subscribe `monitoring:update` → update chart + invalidasi query |

---

## Troubleshooting

### Data real-time tidak muncul di dashboard
1. Pastikan backend berjalan (`GET /api/health` → 200).
2. Pastikan `VITE_SOCKET_URL` di `frontend/.env` benar (`http://localhost:5000`).
3. Pastikan sudah login (socket memakai token JWT).
4. Pastikan device mengirim data (HTTP POST berhasil → `201`).
5. Cek browser console: error koneksi / `connect_error`.

### Socket terputus berulang
- Cek `pingTimeout` (60s) dan `pingInterval` (25s) di backend.
- Cek firewall yang memblokir WebSocket.
- Pastikan CORS mengizinkan origin frontend.

### Device terautentikasi tetapi data tidak tersimpan
- Pastikan `x-api-key` dan `x-device-id` sesuai dengan device aktif di tabel `Esp32Device`.
- Pastikan body `{ bpm, spo2 }` memenuhi range validasi.
- Pastikan ada **sesi ACTIVE** untuk device tersebut — tanpa itu reading tetap disimpan namun **tidak ter-link** ke pasien/sesi.
- Jika Device ID baru saja diganti di dashboard, sesi lama akan disinkronkan otomatis; data baru hanya ter-link jika `x-device-id` yang dikirim = Device ID terdaftar saat ini.

---

## Lanjutkan Membaca

- [Arsitektur](architecture.md)
- [REST API](api.md)
- [Firmware](firmware.md)
- [Frontend](frontend.md)
