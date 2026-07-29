# Panduan Setup — BPM & SpO₂ Monitoring Dashboard

Panduan langkah demi langkah untuk menginstal, mengkonfigurasi, dan menjalankan aplikasi BPM & SpO₂ Monitoring Dashboard di lingkungan development.

---

## Daftar Isi

- [Prasyarat](#prasyarat)
- [Clone Repository](#clone-repository)
- [Setup Backend](#setup-backend)
- [Setup Frontend](#setup-frontend)
- [Akses Aplikasi](#akses-aplikasi)
- [ESP32 Device Configuration](#esp32-device-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prasyarat

### 1. Install Node.js

Unduh dan instal **Node.js versi 22 atau lebih baru** dari [nodejs.org](https://nodejs.org/).

Verifikasi instalasi:

```bash
node --version
# Output: v22.x.x

npm --version
# Output: 10.x.x
```

### 2. Install pnpm (Package Manager)

pnpm direkomendasikan sebagai package manager karena lebih cepat dan efisien.

```bash
npm install -g pnpm

pnpm --version
# Output: 9.x.x
```

> **Catatan:** npm juga dapat digunakan sebagai alternatif.

### 3. Install Git

Unduh dan instal Git dari [git-scm.com](https://git-scm.com/).

Verifikasi instalasi:

```bash
git --version
# Output: git version 2.x.x
```

---

## Clone Repository

```bash
# Clone repository
git clone <repository-url>

# Masuk ke direktori proyek
cd Health
```

Struktur direktori:

```
Health/
├── backend/     # Backend (Express + TypeScript + Prisma)
├── frontend/    # Frontend (React + Vite + TypeScript)
└── docs/        # Dokumentasi
```

---

## Setup Backend

### 1. Install Dependencies

```bash
cd backend

# Menggunakan npm
npm install

# Atau menggunakan pnpm
pnpm install
```

### 2. Konfigurasi Environment Variables

File `.env` sudah tersedia di `backend/.env` untuk development. Jika perlu disesuaikan:

```bash
# Buka file .env
notepad .env
# atau
nano .env
```

File `.env` default:

```env
# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=5000
NODE_ENV=development

# JWT — MUST be >= 64 characters in production; this dev key is for local use only
JWT_SECRET=bpm-monitoring-dev-jwt-secret-key-that-is-at-least-sixty-four-characters-long-for-hs256
JWT_ISSUER=bpm-monitoring

# gRPC
GRPC_HOST=localhost
GRPC_PORT=50051

# CORS
CORS_ORIGIN=http://localhost:5173
```

> **PENTING:** Untuk production, ganti `JWT_SECRET` dengan string acak minimal 64 karakter.

### 3. Generate Prisma Client

```bash
npx prisma generate
```

Perintah ini akan menghasilkan Prisma Client berdasarkan schema di `prisma/schema.prisma`.

Output yang diharapkan:

```
Prisma Client generated in XXXms
```

### 4. Push Schema ke Database

```bash
npx prisma db push
```

Perintah ini akan membuat tabel-tabel database sesuai dengan definisi schema.

Output yang diharapkan:

```
Your database is now in sync with your Prisma schema.
```

### 5. Seed Database dengan Data Contoh

```bash
npm run db:seed
```

Perintah ini akan mengisi database dengan:

| Data                   | Jumlah |
|------------------------|--------|
| Admin user             | 1      |
| Pasien                 | 5      |
| Sesi monitoring        | 5      |
| Pembacaan vital sign   | 50     |
| Pengaturan (settings)  | 4      |
| Perangkat ESP32        | 3      |

Output yang diharapkan:

```
🌱 Seeding database …

  ✓ Admin created: admin@monitoring-bpm.web.id
  ✓ 4 settings created
  ✓ 5 patients created
  ✓ 50 readings across 5 sessions
  ✓ 3 ESP32 devices created

✅ Seeding complete!
```

### 6. Buka Prisma Studio (Opsional)

Untuk melihat dan mengelola data database melalui GUI:

```bash
npx prisma studio
```

Prisma Studio akan terbuka di `http://localhost:5555`.

### 7. Jalankan Development Server

```bash
npm run dev
```

Server akan berjalan di `http://localhost:5000`.

Output yang diharapkan:

```
========================================
  BPM & SpO₂ Monitoring Dashboard
  Environment: development
  HTTP + Socket.IO: http://localhost:5000
  gRPC target: localhost:50051
========================================
```

Server akan secara otomatis restart ketika ada perubahan kode (menggunakan `ts-node-dev`).

---

## Setup Frontend

### 1. Install Dependencies

Buka terminal baru (biarkan backend tetap berjalan):

```bash
cd frontend

# Menggunakan npm
npm install

# Atau menggunakan pnpm
pnpm install
```

### 2. Konfigurasi Environment Variables

File `.env` sudah tersedia di `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
```

Jika backend berjalan di host atau port yang berbeda, sesuaikan nilai-nilai di atas.

### 3. Jalankan Development Server

```bash
npm run dev
```

Server akan berjalan di `http://localhost:5173`.

Output yang diharapkan:

```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### 4. Development Proxy

Frontend Vite telah dikonfigurasi dengan proxy di `vite.config.ts`:

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

Dengan proxy ini, frontend dapat memanggil API menggunakan path relatif (`/api/v1/...`) tanpa menyebutkan domain backend secara langsung.

---

## Akses Aplikasi

Buka browser dan akses:

**http://localhost:5173**

### Halaman Login

![Login Page](*screenshot-placeholder*)

Masukkan kredensial default:

| Field    | Value                          |
|----------|--------------------------------|
| Email    | `admin@monitoring-bpm.web.id`  |
| Password | `Admin123!`                    |

### Halaman Dashboard

Setelah login, Anda akan melihat dashboard dengan:
- **Statistik Ringkasan:** Total pasien, distribusi status (Normal/Waspada/Darurat)
- **Rata-rata Vital Sign:** Rata-rata BPM dan SpO₂ 24 jam terakhir
- **Grafik Perkembangan:** Grafik BPM dan SpO₂ per jam hari ini
- **Pembacaan Terbaru:** 10 data vital sign terbaru

### Menu Navigasi

| Menu          | Halaman                          |
|---------------|----------------------------------|
| Dashboard     | Ringkasan statistik dan grafik   |
| Monitoring    | Data real-time semua pasien      |
| Pasien        | Manajemen data pasien            |
| Riwayat       | Histori pembacaan vital sign     |
| Laporan       | Laporan harian/bulanan + ekspor  |
| Pengaturan    | Konfigurasi threshold            |

---

## ESP32 Device Configuration

### Kredensial Perangkat (Seed Data)

Database telah di-seed dengan 3 perangkat ESP32:

| Device ID         | API Key                                           | Lokasi              | Status  |
|-------------------|---------------------------------------------------|---------------------|---------|
| ESP32-ALPHA-001   | `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6...` (64 chars) | Ruang Observasi 1   | Aktif   |
| ESP32-BETA-002    | `b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7...` (64 chars) | Ruang IGD           | Aktif   |
| ESP32-GAMMA-003   | `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8...` (64 chars) | Ruang Perawatan 2   | Nonaktif |

### Koneksi Socket.IO dari ESP32

```cpp
// Contoh kode ESP32 (Arduino/C++)
#include <WiFi.h>
#include <SocketIoClient.h>

SocketIoClient socket;

void setup() {
  WiFi.begin("SSID", "PASSWORD");

  socket.on("connect", []() {
    Serial.println("Terhubung ke server!");
  });

  socket.on("esp32:ack", [](const char* payload) {
    Serial.printf("ACK: %s\n", payload);
  });

  socket.on("esp32:error", [](const char* payload) {
    Serial.printf("Error: %s\n", payload);
  });

  // Koneksi ke server
  socket.begin("192.168.1.100", 5000, "/?deviceId=ESP32-ALPHA-001&apiKey=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1");
}

void loop() {
  socket.loop();

  // Kirim data setiap 5 detik
  static unsigned long lastSend = 0;
  if (millis() - lastSend > 5000) {
    // Baca sensor MAX30100
    int bpm = readBPM();
    int spo2 = readSpO2();

    // Kirim data ke server
    socket.emit("esp32:reading",
      "{\"deviceId\":\"ESP32-ALPHA-001\","
      "\"apiKey\":\"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1\","
      "\"patientId\":1,"
      "\"bpm\":" + String(bpm) + ","
      "\"spo2\":" + String(spo2) + "}"
    );

    lastSend = millis();
  }
}

int readBPM() {
  // Implementasi pembacaan sensor MAX30100
  return random(60, 100); // Contoh nilai
}

int readSpO2() {
  // Implementasi pembacaan sensor MAX30100
  return random(95, 100); // Contoh nilai
}
```

### Menambahkan Perangkat Baru

Untuk menambahkan perangkat ESP32 baru, tambahkan record ke tabel `Esp32Device`:

1. Generate API key (64 karakter hex).
2. Hash API key menggunakan SHA-256.
3. Simpan hash di database.
4. Konfigurasi ESP32 dengan API key asli (plaintext).

---

## Troubleshooting

### Masalah: Database Error

**Gejala:** Error saat menjalankan `npx prisma db push` atau `npm run db:seed`.

**Solusi:**

```bash
# Hapus database lama
del backend\prisma\dev.db

# Generate ulang Prisma Client
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

### Masalah: Port Sudah Digunakan

**Gejala:** Error `EADDRINUSE` saat menjalankan server.

**Solusi:**

```bash
# Cari proses yang menggunakan port
netstat -ano | findstr :5000
netstat -ano | findstr :5173

# Hentikan proses (ganti PID sesuai hasil)
taskkill /PID <PID> /F

# Atau gunakan port berbeda dengan mengubah .env
PORT=5001
```

### Masalah: Modul Tidak Ditemukan

**Gejala:** Error `Cannot find module` saat menjalankan perintah.

**Solusi:**

```bash
# Hapus node_modules dan install ulang
rm -rf node_modules
npm install

# Untuk backend
cd backend
rm -rf node_modules
npm install

# Untuk frontend
cd frontend
rm -rf node_modules
npm install
```

### Masalah: Prisma Client Not Found

**Gejala:** Error `PrismaClient is not a constructor` atau `@prisma/client` not found.

**Solusi:**

```bash
cd backend
npx prisma generate
```

### Masalah: CORS Error

**Gejala:** Error CORS di browser saat frontend memanggil API backend.

**Solusi:**

Pastikan `CORS_ORIGIN` di `backend/.env` sesuai dengan URL frontend:

```env
CORS_ORIGIN=http://localhost:5173
```

Jika menggunakan jaringan yang berbeda, atur `CORS_ORIGINS` (dipisah koma):

```env
CORS_ORIGINS=http://localhost:5173, http://192.168.1.100:5173
```

### Masalah: Socket.IO Tidak Terhubung

**Gejala:** Data real-time tidak muncul di dashboard.

**Solusi:**

1. Pastikan backend berjalan (cek `http://localhost:5000/api/health`).
2. Pastikan `VITE_SOCKET_URL` di frontend sesuai dengan URL backend.
3. Periksa browser console untuk error koneksi WebSocket.
4. Pastikan tidak ada firewall yang memblokir koneksi WebSocket.

---

## Perintah Cepat

### Backend

```bash
# Generate Prisma Client
cd backend && npx prisma generate

# Push schema + seed database
cd backend && npx prisma db push && npm run db:seed

# Reset database + seed
cd backend && npm run db:reset

# Buka database GUI
cd backend && npx prisma studio

# Build untuk production
cd backend && npm run build

# Jalankan production
cd backend && npm start
```

### Frontend

```bash
# Build untuk production
cd frontend && npm run build

# Preview build
cd frontend && npm run preview

# Lint kode
cd frontend && npm run lint
```
