# Dokumentasi BPM & SpO₂ Monitoring Dashboard

Selamat datang di dokumentasi lengkap **BPM & SpO₂ Monitoring Dashboard** — sistem pemantauan denyut jantung (BPM) dan saturasi oksigen (SpO₂) pasien secara real-time berbasis web.

Dokumentasi ini mencakup seluruh aspek sistem: arsitektur, instalasi, API, real-time, firmware IoT, database, frontend, keamanan, deployment, hingga pengujian.

---

## Daftar Dokumentasi

| Dokumen | Isi |
|---------|-----|
| [📖 Overview](overview.md) | Gambaran umum sistem, fitur utama, teknologi (tech stack) |
| [🚀 Setup](setup.md) | Panduan instalasi & konfigurasi lingkungan development |
| [🏗️ Arsitektur](architecture.md) | Desain arsitektur, alur data, struktur modul, C4 diagrams |
| [🔌 REST API](api.md) | Referensi lengkap semua endpoint API |
| [⚡ Socket.IO / Real-Time](socketio.md) | Event real-time, koneksi, protokol WebSocket |
| [🗄️ Database](database.md) | Schema database, ERD, data seed |
| [📡 Firmware](firmware.md) | Dokumentasi firmware ESP8266 + sensor MAX30100 |
| [🖥️ Frontend](frontend.md) | Struktur frontend, halaman, routing, services, hooks |
| [🔐 Keamanan](security.md) | Arsitektur keamanan, autentikasi, enkripsi, rate limiting |
| [🌐 Deployment](deployment.md) | Deployment production (Docker, CI/CD) |
| [🧪 Testing](testing.md) | Strategi pengujian & pipeline CI/CD |

---

## Ringkasan Sistem

```
┌──────────────┐        ┌──────────────────────────────────────────┐
│  ESP8266 /   │  HTTP  │               Backend (Node.js)          │
│  ESP32       │  POST  │  Express 5 · Socket.IO · gRPC · Prisma   │
│  MAX30100    │────────▶│  http://localhost:5000                   │
└──────────────┘        │  REST /api/v1/*                          │
                        └──────────────┬───────────────────────────┘
                                       │ Socket.IO events
                        ┌──────────────▼───────────────────────────┐
                        │  Frontend React (Vite)                    │
                        │  http://localhost:5173                    │
                        └──────────────────────────────────────────┘
```

**Alur kerja inti:**
1. Perangkat IoT (ESP8266/ESP32 + sensor MAX30100) membaca BPM & SpO₂ pasien.
2. Data dikirim ke backend melalui **HTTP POST** `POST /api/v1/readings/device` (dengan header autentikasi `x-api-key` & `x-device-id`).
3. Backend memvalidasi, menghitung status (Normal/Waspada/Darurat), menyimpan ke database (SQLite/PostgreSQL via Prisma), lalu **broadcast real-time** ke admin client via Socket.IO.
4. Admin memantau pasien, melihat grafik real-time, mengelola pasien/device, dan mengekspor laporan PDF/Excel.

---

## Port Aplikasi

| Service | Port | Deskripsi |
|---------|------|-----------|
| Frontend (Vite dev) | `5173` | Web dashboard |
| Backend HTTP + Socket.IO | `5000` | REST API + real-time |
| gRPC (opsional) | `50051` | gRPC services |
| Prisma Studio | `5555` | GUI database |
| UDP Discovery | `5500` | Auto-find backend oleh device (optional) |

---

## Kredensial Default

| Field | Nilai |
|-------|-------|
| Email | `admin@monitoring-bpm.web.id` |
| Password | `Admin123!` |

> ⚠ Ganti password default segera setelah deploy ke production.
