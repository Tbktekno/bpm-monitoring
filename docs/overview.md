# Overview — BPM & SpO₂ Monitoring Dashboard

Dokumen ini memberikan gambaran umum sistem, fitur utama, arsitektur teknologi, dan komponen-komponen penyusun aplikasi.

---

## 1. Apa Itu Sistem Ini?

**BPM & SpO₂ Monitoring Dashboard** adalah aplikasi berbasis web untuk memantau **denyut jantung (BPM)** dan **saturasi oksigen (SpO₂)** pasien secara **real-time**. Sistem ini dirancang untuk digunakan di fasilitas kesehatan (rumah sakit, puskesmas, klinik) untuk observasi pasien berkelanjutan (*continuous monitoring*).

**Arsitektur utama:**
- Perangkat **IoT (ESP8266/ESP32 + sensor MAX30100)** membaca vital sign pasien.
- Data dikirim ke **backend** (Express) melalui HTTP POST yang diautentikasi.
- Backend menyimpan data ke database via **Prisma ORM** dan menyebarkannya secara real-time ke dashboard admin via **Socket.IO**.
- Admin memantau, mengelola pasien & perangkat, melihat riwayat, dan mengekspor laporan.

---

## 2. Fitur Utama

### Monitoring & Real-Time
| Fitur | Deskripsi |
|-------|-----------|
| **Pemantauan real-time** | Data BPM & SpO₂ diterima dari perangkat IoT dan ditampilkan langsung (grafik & angka) via Socket.IO. |
| **Sesi monitoring** | Sesi mulai/selesai per pasien + perangkat. Device dipilih otomatis dari device aktif di registry. Semua pembacaan tercatat otomatis ke sesi. |
| **Sinkronisasi device id** | Jika perangkat di-rename (Device ID baru), seluruh sesi lama ikut disinkronkan otomatis ke id baru — laporan tidak lagi menampilkan id usang. |
| **Sistem peringatan** | Notifikasi real-time (`monitoring:alert`) ketika BPM/SpO₂ melampaui ambang batas. |
| **Peringatan threshold** | Cache ambang batas di-load dari tabel `Setting` setiap 5 menit. |

### Manajemen Data
| Fitur | Deskripsi |
|-------|-----------|
| **Manajemen pasien** | CRUD lengkap (tambah, lihat, edit, hapus) dengan validasi, pencarian, pagination. |
| **Laporan sesi** | Seluruh sesi monitoring tampil di halaman Laporan dengan statistik rata-rata BPM/SpO₂ dan dugaan penyakit. |
| **Dashboard interaktif** | Statistik agregat, distribusi status pasien, grafik BPM/SpO₂ per jam, 10 pembacaan terbaru. |
| **Manajemen perangkat** | CRUD perangkat ESP32/ESP8266, generate API key (ditampilkan sekali), aktif/nonaktif, rename device id. |

### Laporan & Ekspor
| Fitur | Deskripsi |
|-------|-----------|
| **Laporan harian** | Agregasi pembacaan per hari dalam rentang tanggal. |
| **Laporan bulanan** | Agregasi pembacaan per bulan dalam satu tahun. |
| **Ekspor PDF** | Laporan harian/bulanan PDF (PDFKit) dan **PDF laporan sesi** bergaya rumah sakit. |
| **Status penyakit** | Klasifikasi dugaan penyakit (Dugaan Bradikardia/Takikardia/Hipoksemia) berdasarkan rata-rata BPM & SpO₂ sesi. |

### Pengaturan & Admin
| Fitur | Deskripsi |
|-------|-----------|
| **Autentikasi JWT** | Login aman dengan JWT (HS256), blacklist token, remember me (7 hari). |
| **Profil admin** | Ubah nama & email, ganti password. |
| **Pengaturan threshold** | *Tersedia via API* (`PUT /api/v1/settings/thresholds`); UI threshold di halaman Settings dihapus, ambang default tetap dibaca backend dari tabel `Setting`. |
| **Hapus data monitoring** | Bersihkan semua readings/sessions/log audit tanpa menghapus device & admin. |
| **Audit trail** | Semua aktivitas admin (login, CRUD, settings) tercatat di tabel `AuditLog`. |

### Infrastruktur
| Fitur | Deskripsi |
|-------|-----------|
| **gRPC services** | Layanan gRPC opsional (Auth, Dashboard, Patient, Monitoring, Report, Settings). |
| **mDNS advertising** | Backend dipublikasikan sebagai `bpm-server.local` / service `_bpm-monitor._tcp`. |
| **UDP discovery** | Listener UDP port 5500 untuk auto-find backend (mode alternatif). |
| **CI/CD** | Pipeline GitHub Actions: lint → test → build → docker (push ke GHCR). |
| **Docker Compose** | Orchestrasi production: PostgreSQL + backend + frontend (nginx). |

---

## 3. Teknologi (Tech Stack)

| Lapisan | Teknologi |
|---------|-----------|
| **Frontend** | React 19, TypeScript 6, Vite 8 |
| **Styling** | Tailwind CSS 3, Framer Motion |
| **State** | TanStack React Query 5, React Context |
| **Routing** | React Router DOM 7 |
| **Form & Validasi** | React Hook Form, Zod |
| **Chart** | Recharts |
| **Notifikasi UI** | Sonner |
| **Backend** | Node.js 22+, Express 5, TypeScript |
| **ORM** | Prisma 5 |
| **Database** | SQLite (development) / PostgreSQL (production) |
| **Real-Time** | Socket.IO 4 |
| **Autentikasi** | JWT (jsonwebtoken), bcryptjs |
| **gRPC** | @grpc/grpc-js, protobuf |
| **Laporan** | PDFKit |
| **Logging** | Winston |
| **Keamanan** | Helmet, CORS, express-rate-limit |
| **IoT** | Arduino/ESP8266 (Arduino IDE / PlatformIO), MAX30100 |

---

## 4. Komponen Repository

```
bpm-monitoring/
├── .github/workflows/ci.yml   # CI/CD pipeline
├── backend/                   # Backend Express + TypeScript
│   ├── prisma/                # Schema database + seed
│   ├── proto/                 # Definisi protobuf (health, monitoring)
│   ├── src/                   # Source code backend
│   └── ...
├── firmware/                  # Firmware ESP8266/ESP32 + MAX30100
│   ├── esp8266-max30100/      # Firmware utama v2.1
│   └── test-max30100/         # Firmware tes sensor
├── frontend/                  # Frontend React (Vite + TS)
│   └── src/                   # Source code frontend
├── docs/                      # Dokumentasi ini
├── docker-compose.yml         # Orchestrasi production
├── run-dev.bat / run-dev.ps1  # Skrip menjalankan development
├── test-system.mjs            # Skrip test sistem
└── simulate-device.mjs        # Simulator data sensor ESP8266 (testing)
```

---

## 5. Alur Kerja End-to-End

```
1. Admin login di dashboard frontend → dapat JWT token
2. Admin mulai sesi monitoring untuk pasien + device tertentu
3. ESP8266 membaca BPM & SpO₂ dari MAX30100
4. ESP8266 POST ke backend: POST /api/v1/readings/device
   Headers: x-api-key, x-device-id  |  Body: { bpm, spo2 }
5. Backend:
   a. Autentikasi device (hash SHA-256 API key vs DB)
   b. Validasi range (BPM 30-250, SpO₂ 50-100)
   c. Temukan sesi ACTIVE device tsb → kaitkan pasien
   d. Hitung bpmStatus / spo2Status / status (Normal/Waspada/Darurat)
   e. Simpan Reading ke database
   f. Broadcast monitoring:update (+ monitoring:alert jika abnormal)
6. Dashboard admin menampilkan data real-time (grafik & status)
7. Setelah selesai, admin stop sesi → tersimpan sebagai COMPLETED
8. Admin dapat melihat laporan sesi & mengekspor PDF.
```

---

## 6. Status Klasifikasi Vital Sign

### BPM (Denyut Jantung)
| Rentang (bpm) | bpmStatus | Keterangan |
|---------------|-----------|------------|
| < 60 | `BRADICARDIA` | Denyut lambat |
| 60 – 100 | `NORMAL` | Normal |
| 101 – 120 | `TACHY_RINGAN` | Takikardia ringan |
| > 120 | `TACHY_BERAT` | Takikardia berat |

### SpO₂ (Saturasi Oksigen)
| Rentang (%) | spo2Status | Keterangan |
|-------------|------------|------------|
| ≥ 95 | `NORMAL` | Normal |
| 90 – 94 | `HIPOKSEMIA_RINGAN` | Hipoksemia ringan |
| 85 – 89 | `HIPOKSEMIA_SEDANG` | Hipoksemia sedang |
| < 85 | `HIPOKSEMIA_BERAT` | Hipoksemia berat |

### Status Gabungan (Composite)
| Kondisi | Status |
|---------|--------|
| BPM Normal DAN SpO₂ Normal | `NORMAL` |
| `BRADICARDIA` / `TACHY_BERAT` / `HIPOKSEMIA_SEDANG` / `HIPOKSEMIA_BERAT` | `DARURAT` |
| Selain di atas | `WASPADA` |

### Dugaan Penyakit (Disease Classification)
Digunakan pada laporan sesi & PDF, berdasarkan **rata-rata** BPM & SpO₂:

| Kondisi | Diagnosis |
|---------|-----------|
| SpO₂ < 95% | `Dugaan Hipoksemia` |
| SpO₂ 95–100% & BPM < 60 | `Dugaan Bradikardia` |
| SpO₂ 95–100% & BPM > 100 | `Dugaan Takikardia` |
| SpO₂ 95–100% & BPM 60–100 | `Normal` |

---

## 7. Halaman-Halaman Aplikasi

| Route | Halaman | Fungsi |
|-------|---------|--------|
| `/login` | Login | Autentikasi admin |
| `/` | Dashboard | Statistik & grafik ringkasan |
| `/monitoring` | Monitoring | Monitoring real-time, mulai/stop sesi |
| `/monitoring/:patientId` | Monitoring Detail | Detail pasien + grafik real-time |
| `/patients` | Daftar Pasien | List & pencarian pasien |
| `/patients/:id` | Detail Pasien | Detail + riwayat pasien |
| `/reports` | Laporan | Laporan sesi monitoring + ekspor PDF (harian/bulanan via API) |
| `/settings` | Pengaturan | Profil, password, hapus data |
| `/devices` | Perangkat | Manajemen ESP32/ESP8266 |

---

## 8. Lanjutkan Membaca

- [Setup Development](setup.md)
- [Arsitektur](architecture.md)
- [REST API](api.md)
- [Real-Time (Socket.IO)](socketio.md)
- [Database](database.md)
- [Firmware ESP8266](firmware.md)
- [Frontend](frontend.md)
- [Keamanan](security.md)
- [Deployment](deployment.md)
- [Testing & CI](testing.md)
