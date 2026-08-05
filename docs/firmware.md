# Firmware ESP8266 / ESP32 — BPM & SpO₂ Monitor

Dokumen ini menjelaskan firmware perangkat IoT yang membaca BPM & SpO₂ dari sensor **MAX30100** dan mengirimkannya ke backend.

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Struktur Direktori Firmware](#struktur-direktori-firmware)
- [Komponen Hardware](#komponen-hardware)
- [Wiring](#wiring)
- [Instalasi Arduino IDE](#instalasi-arduino-ide)
- [Protokol Komunikasi](#protokol-komunikasi)
- [State Machine](#state-machine)
- [Config Portal (WiFi Manager)](#config-portal-wifi-manager)
- [Discovery Server (mDNS / DNS)](#discovery-server-mdns--dns)
- [Status LCD](#status-lcd)
- [Perintah Serial](#perintah-serial)
- [Pendaftaran Device di Backend](#pendaftaran-device-di-backend)
- [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

Firmware utama berada di `firmware/esp8266-max30100/esp8266-max30100.ino` (versi v2.1).

**Fitur:**
- Membaca BPM & SpO₂ dari sensor MAX30100.
- Menampilkan ke LCD I2C 16x2.
- **Config Portal** (Access Point + web form) untuk konfigurasi WiFi & server pertama kali.
- **mDNS/DNS auto-discovery** server backend (`bpm-server.local`).
- **HTTP POST** data ke backend (`POST /api/v1/readings/device`).
- Penyimpanan konfigurasi di **LittleFS** (`/config.json`).
- **Factory reset** dengan tombol FLASH saat boot.
- **Watchdog anti-stuck** untuk nilai BPM yang tidak berubah.

> ⚠ Firmware versi sekarang memakai **HTTP POST** (bukan Socket.IO/WebSocket) untuk mengirim data.

---

## Struktur Direktori Firmware

```
firmware/
├── esp8266-max30100/          # Firmware utama v2.1
│   ├── esp8266-max30100.ino   # FIRMWARE UTAMA (buka di Arduino IDE)
│   ├── platformio.ini         # Opsional untuk PlatformIO
│   ├── README.md              # Dokumentasi firmware
│   └── esp8266-RFID-REFERENCE.ino.bak  # Referensi (tidak dipakai)
└── test-max30100/             # Firmware tes sensor (debug)
    ├── test-max30100.ino
    └── platformio.ini
```

---

## Komponen Hardware

| Komponen | Spesifikasi |
|----------|-------------|
| ESP8266 | NodeMCU v3 / Wemos D1 Mini / ESP-01 |
| MAX30100 | Pulse Oximeter & Heart Rate Sensor |
| LCD I2C 16x2 | PCF8574 I2C Backpack |
| Breadboard + Jumper | Secukupnya |

---

## Wiring

```
MAX30100 VIN → 3.3V       LCD I2C VCC → 5V
MAX30100 GND → GND        LCD I2C GND → GND
MAX30100 SCL → D1(GPIO5)  LCD I2C SCL → D1(GPIO5)   ← bus I2C bersama
MAX30100 SDA → D2(GPIO4)  LCD I2C SDA → D2(GPIO4)   ← bus I2C bersama
```

> MAX30100 (addr `0x57`) dan LCD I2C (addr `0x27`/`0x3F`) aman berbagi bus I2C.

---

## Instalasi Arduino IDE

### 1. Install Board ESP8266
- **File → Preferences → Additional Boards Manager URLs:**
  ```
  http://arduino.esp8266.com/stable/package_esp8266com_index.json
  ```
- **Tools → Board → Boards Manager** → cari "esp8266" → Install

### 2. Install Library (Tools → Manage Libraries)

| Nama | Cari | Versi |
|------|------|-------|
| **MAX30100** | `MAX30100` by OXulloIntercaps | ≥ 1.1.5 |
| **LiquidCrystal_I2C** | `LiquidCrystal_I2C` by marcoschwartz | ≥ 1.1.4 |
| **ArduinoJson** | `ArduinoJson` by Benoit Blanchon | ≥ 7.0.3 |

> WiFi, mDNS, HTTPClient, WebServer, LittleFS sudah built-in di board ESP8266.

### 3. Upload
- **File → Open** → `esp8266-max30100.ino`
- Tools → Board → **NodeMCU 1.0 (ESP-12E)**
- Tools → Port → COMx
- **Upload** (→)

---

## Protokol Komunikasi

### Kirim Data (Perangkat → Backend)

```
POST http://{server-ip}:{port}/api/v1/readings/device
```

**Headers:**
```
Content-Type: application/json
x-api-key: bpm-sample-alpha-key-001
x-device-id: ESP32-ALPHA-001
```

**Body:**
```json
{ "bpm": 75, "spo2": 98 }
```

**Response sukses (201):**
```json
{ "success": true, "data": { "readingId": 51, "status": "NORMAL" }, "message": "Data tersimpan" }
```

**Implementasi di firmware (`sendReading()`):**
- Filter: bpm/spo2 > 0 dan bpm 30–250 (nilai tidak realistis dilewati).
- Reset FIFO MAX30100 **sebelum** HTTP (mencegah pointer FIFO out-of-sync saat HTTP blocking).
- Timeout HTTP 3 detik.
- Setelah HTTP, `catchUpSensor()` membaca ulang FIFO.

### Health Check
```
GET http://{server-ip}:{port}/api/health
```
Dilakukan saat boot untuk memastikan backend hidup (informational only).

### Interval Kirim
- `SEND_INTERVAL_MS = 3000` (3 detik).
- `LCD_UPDATE_INTERVAL_MS = 500`.

---

## State Machine

```
┌──────────────┐
│   BOOTING    │
└──────┬───────┘
       ▼
┌──────────────────┐
│   WIFI_CONFIG    │  ← Config Portal (AP Mode), blocking
└──────┬───────────┘
       ▼
┌──────────────────┐
│ WIFI_CONNECTING  │◀────┐
└────────┬─────────┘     │ gagal
         │ sukses        │
         ▼               │
┌──────────────────┐     │
│  WIFI_RETRY      │─────┘  (delay 15 detik)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ MDNS_RESOLVING   │◀──────┐
└────────┬─────────┘       │ retry
         │ server ditemukan│
         ▼                 │
┌──────────────────┐       │
│   MONITORING     │───────┘  (resolve ulang jika perlu)
└────────┬─────────┘
         │ sensor gagal
         ▼
┌──────────────────┐
│  SENSOR_ERROR    │  (retry 30 detik)
└──────────────────┘
```

---

## Config Portal (WiFi Manager)

Skenario masuk Config Portal:
1. **Pertama kali boot** (belum ada config tersimpan).
2. **WiFi gagal terkoneksi** (8 detik timeout).
3. **Factory reset** (tahan tombol FLASH saat boot).
4. Perintah serial `portal` / `cfg`.

**Cara pakai:**
1. Cari WiFi `BPM-Monitor-Setup` di HP/laptop.
2. Buka browser → halaman konfigurasi otomatis (atau akses IP AP).
3. Isi form:

| Field | Default | Keterangan |
|-------|---------|------------|
| WiFi SSID | - | Nama WiFi |
| WiFi Password | - | Password WiFi |
| Server Hostname / IP | `bpm-server` | Hostname atau IP backend |
| Port | `5000` | Port backend |
| Patient ID | `1` | ID pasien |
| Device ID | `ESP32-ALPHA-001` | ID device (harus terdaftar) |
| API Key | `bpm-sample-alpha-key-001` | API key (min 16 karakter) |

4. Klik **Simpan & Reboot** → ESP8266 menyimpan ke LittleFS dan reboot.

**Factory Reset:** tahan tombol **FLASH (GPIO0)** saat boot → hapus semua config + WiFi → reboot ke Config Portal.

---

## Discovery Server (mDNS / DNS)

`resolveServer()` menggunakan 3 metode berurutan:

1. **IP langsung** — jika `cfgServerHost` sudah berupa IP.
2. **DNS** — `WiFi.hostByName(host)` lalu coba `host.local`.
3. **mDNS Service Discovery** — query service `_bpm-monitor._tcp`, cocokkan nama host, lalu pakai IP+port hasil query.

**Di sisi backend** (`src/shared/mdns-advertiser.ts`), backend mempublikasikan:
- Hostname: `bpm-server.local`
- Service: `_bpm-monitor._tcp` (port `env.port`)

**Agar mDNS bekerja di jaringan:**
| OS | Cara |
|----|------|
| Windows | Install **Bonjour Print Services** (Apple) |
| macOS | Built-in (Bonjour) |
| Linux | `sudo apt-get install avahi-daemon` |

> Alternatif tanpa mDNS: isi **Server Hostname** dengan IP langsung (mis. `192.168.1.100`).

---

## Status LCD

| Tampilan | Arti |
|----------|------|
| `System Booting..` | Inisialisasi hardware |
| `Config Mode` / `AP: BPM-Monitor` | Mode konfigurasi |
| `WiFi: Connecting` | Menghubungkan WiFi |
| `WiFi: GAGAL!` | WiFi gagal, retry |
| `Mencari Server` / `bpm-server` | Mencari server via mDNS/DNS |
| `Server Tak Ditemukan` | mDNS gagal — cek hostname |
| `BPM: 72 SpO2: 98%` | Monitoring aktif |
| `Tempelkan Jari!` | Jari belum terdeteksi |
| `P:ALPHA S:12` | Info device + jumlah kirim |
| `Sensor ERROR!` | MAX30100 bermasalah |

---

## Perintah Serial

| Perintah | Fungsi |
|----------|--------|
| `help` / `h` / `?` | Tampilkan bantuan |
| `portal` / `cfg` | Buka Config Portal (AP Mode) |
| `reset` / `rst` | Factory reset (hapus WiFi + config, reboot) |

Contoh output Serial:
```
 Waktu      │ BPM  │ SpO2 │ Status
────────────┼──────┼──────┼──────────────
 10:30:01   │   72 │  98  │ NORMAL  ♥
 10:30:04   │   75 │  97  │ NORMAL  ♥
```

---

## Pendaftaran Device di Backend

Sebelum digunakan, device harus terdaftar di backend:

**Opsi 1 — Via Dashboard (disarankan):**
1. Login → menu **Perangkat** → **Tambah Device**.
2. Isi Device ID + Label.
3. Sistem menampilkan **API Key sekali saja** → salin & simpan.
4. Masukkan Device ID & API key tersebut ke Config Portal firmware.

**Opsi 2 — Via API:**
```
POST /api/v1/devices
Body: { "deviceId": "ESP32-DELTA-004", "label": "Ruang ICU" }
Authorization: Bearer <admin-jwt>
```

**Opsi 3 — Seed data (untuk testing):**

| Device ID | API Key |
|-----------|---------|
| `ESP32-ALPHA-001` | `bpm-sample-alpha-key-001` |
| `ESP32-BETA-002` | `bpm-sample-beta-key-002` |
| `ESP32-GAMMA-003` | `bpm-sample-gamma-key-003` |

---

## Troubleshooting

### ESP8266 tidak masuk Config Portal
- Tekan tombol **RESET** / **FLASH** saat boot.
- Flash ulang firmware jika perlu.

### Server tidak ditemukan
1. Pastikan backend menyala.
2. Coba isi **Server Hostname** dengan IP langsung.
3. Cek `ping bpm-server.local` dari laptop (mDNS).
4. Cek mDNS di OS server (Bonjour/avahi).

### MAX30100 tidak terdeteksi
1. Cek kabel I2C (SCL/SDA jangan terbalik).
2. Tegangan MAX30100 harus **3.3V**.
3. Turunkan I2C clock: cari `#define I2C_CLOCK_HZ 100000` → ganti `50000`.

### BPM / SpO₂ tidak stabil
- Tempelkan jari dengan tenang.
- Sesuaikan `SENSOR_IR_LED_CURRENT` di file .ino.
- Kurangi pencahayaan ruangan.

### Nilai BPM stuck
- Firmware punya **watchdog anti-stuck** (15 detik tanpa perubahan → reset FIFO paksa).

### API key ditolak (401)
- Pastikan device terdaftar & **aktif** di tabel `Esp32Device`.
- API key harus **tepat sama** (plaintext) dengan yang didaftarkan.

---

## Keamanan

> ⚠ API key dikirim dalam bentuk plaintext (HTTP). Di sisi server, API key di-hash dengan **SHA-256** sebelum disimpan. Untuk production, gunakan **HTTPS/WSS** dan jaringan terisolasi.

---

## Lanjutkan Membaca

- [Overview](overview.md)
- [REST API](api.md)
- [Socket.IO / Real-Time](socketio.md)
- [Database](database.md)
