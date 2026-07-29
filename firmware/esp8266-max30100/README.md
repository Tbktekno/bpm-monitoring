# ESP8266 BPM & SpO₂ Monitor — Firmware v2

Firmware untuk **ESP8266** yang membaca **BPM** dan **SpO₂** dari sensor **MAX30100**, menampilkan di **LCD I2C 16x2**, dan mengirim ke **BPM Monitoring Dashboard** via **Socket.IO**.

## ✨ Fitur Baru v2

| Fitur | Keterangan |
|-------|-----------|
| **🔧 WiFi Config Mode** | Pertama kali / WiFi gagal → otomatis jadi Access Point "BPM-Monitor" |
| **🌐 Captive Portal** | Hubungkan WiFi ke "BPM-Monitor", browser terbuka otomatis, isi form SSID/Password |
| **📡 mDNS** | Server backend ditemukan otomatis via `bpm-server.local` — **tanpa setting IP manual** |
| **💾 EEPROM** | Semua konfigurasi tersimpan — tidak hilang meski listrik mati |
| **🔄 Auto Resolve** | Jika server berganti IP, ESP8266 akan menemukannya ulang via mDNS |

## 🔧 Komponen Hardware

| Komponen | Spesifikasi |
|----------|-------------|
| ESP8266 | NodeMCU v3 / Wemos D1 Mini / ESP-01 |
| MAX30100 | Pulse Oximeter & Heart Rate Sensor |
| LCD I2C 16x2 | PCF8574 I2C Backpack |
| Breadboard + Jumper | Secukupnya |

## 🔌 Wiring

```
MAX30100 VIN → 3.3V       LCD I2C VCC → 5V
MAX30100 GND → GND        LCD I2C GND → GND
MAX30100 SCL → D1(GPIO5)  LCD I2C SCL → D1(GPIO5) — bus I2C bersama
MAX30100 SDA → D2(GPIO4)  LCD I2C SDA → D2(GPIO4) — bus I2C bersama
```

> MAX30100 (addr: `0x57`) dan LCD I2C (addr: `0x27`/`0x3F`) aman berbagi bus I2C.

## 💻 Instalasi Arduino IDE

### 1. Install Board ESP8266
- **File → Preferences → Additional Boards Manager URLs:**
  ```
  http://arduino.esp8266.com/stable/package_esp8266com_index.json
  ```
- **Tools → Board → Boards Manager** → cari **"esp8266"** → Install

### 2. Install Library (Tools → Manage Libraries)

| Nama | Cari | Versi |
|------|------|-------|
| **WiFiManager** | `WiFiManager` by tzapu | ≥ 2.0.16 |
| **MAX30100** | `MAX30100` by OXulloIntercaps | ≥ 1.1.5 |
| **LiquidCrystal_I2C** | `LiquidCrystal_I2C` by marcoschwartz | ≥ 1.1.4 |
| **WebSockets** | `WebSockets` by Markus Sattler | ≥ 2.4.1 |
| **ArduinoJson** | `ArduinoJson` by Benoit Blanchon | ≥ 7.0.3 |

### 3. Buka & Upload
- **File → Open** → pilih **`esp8266-max30100.ino`**
- Tools → Board → **NodeMCU 1.0 (ESP-12E)**
- Tools → Port → **COMx**
- **Upload** (→)

## 🚀 Cara Kerja — First Boot

### Skenario A: Pertama Kali / WiFi Tidak Ada

| Langkah | LCD Menampilkan | Yang Terjadi |
|---------|----------------|--------------|
| 1 | `System Booting..` | ESP8266 menyala, cek WiFi tersimpan |
| 2 | `WiFi: Connect` | Mencoba konek — gagal (belum ada config) |
| 3 | `Config Mode` / `AP: BPM-Monitor` | ESP8266 jadi Access Point |
| 4 | *(lihat HP/laptop)* | Cari WiFi "**BPM-Monitor**" di HP/laptop, sambungkan |
| 5 | *(browser terbuka)* | Masuk ke halaman konfigurasi |
| 6 | *(isi form)* | Masukkan: SSID, Password WiFi, **Server Hostname**, Device ID, API Key, Patient ID |
| 7 | `WiFi: Connect` | ESP8266 reboot & konek ke WiFi yang dikonfigurasi |
| 8 | `Mencari Server` | ESP8266 cari `bpm-server.local` via mDNS |
| 9 | `Server: Connect` | WebSocket tersambung ke backend |
| 10 | `BPM: 72 SpO2: 98%` | **Monitoring Aktif!** |

### Skenario B: WiFi Sudah Pernah Dikonfigurasi

| Langkah | LCD Menampilkan |
|---------|----------------|
| 1 | `System Booting..` |
| 2 | Langsung konek WiFi |
| 3 | `Mencari Server` → `Server Terhubung` |
| 4 | `BPM: 72 SpO2: 98%` |

### Skenario C: Ganti Jaringan / Pindah Lokasi

Cukup **reset ESP8266** → otomatis masuk Config Portal → konfigurasi ulang WiFi.

## ⚙️ Pengaturan di Config Portal

| Field | Default | Keterangan |
|-------|---------|------------|
| **WiFi SSID** | *(dipilih manual)* | Nama WiFi yang akan dipakai |
| **WiFi Password** | *(diisi manual)* | Password WiFi |
| **Server Hostname** | `bpm-server` | Hostname server backend — akan di-resolve via mDNS/DNS |
| **Server Port** | `5000` | Port backend server |
| **Device ID** | `ESP8266-001` | ID unik perangkat — daftarkan di dashboard |
| **API Key** | `change-this-api-key-123456` | API Key untuk autentikasi — **min 16 karakter** |
| **Patient ID** | `1` | ID pasien dari database |

> ⚠ **Sebelum menggunakan**, daftarkan perangkat di dashboard web:
> 1. Login → Settings → ESP32 Devices → **Add Device**
> 2. Masukkan **Device ID** dan **API Key** yang sama
> 3. Catat **Patient ID** pasien

## 📡 mDNS — Auto Server Discovery

Firmware menggunakan mDNS untuk menemukan server backend secara otomatis:

1. **Cara 1:** Resolve `bpm-server.local` via DNS/mDNS
2. **Cara 2:** Query service `_bpm-monitor._tcp` di jaringan
3. **Cara 3:** Jika semua gagal, tampilkan error di LCD (cek hostname)

### Agar mDNS Berfungsi

Server backend harus bisa diakses via `bpm-server.local`:

| OS | Cara |
|----|------|
| **Windows** | Install **Bonjour Print Services** (free dari Apple) |
| **macOS** | Sudah built-in (Bonjour) |
| **Linux** | `sudo apt-get install avahi-daemon` |
| **Via Router** | Jika router support mDNS reflection, cukup set hostname di server |

**Alternatif tanpa mDNS:** Di Config Portal, isi **Server Hostname** dengan IP langsung (misal `192.168.1.100`).

## 📱 Status LCD

| Tampilan | Arti |
|----------|------|
| `System Booting..` | Inisialisasi hardware |
| `Config Mode` / `AP: BPM-Monitor` | Mode konfigurasi — sambungkan ke WiFi "BPM-Monitor" |
| `WiFi: Connecting` | Menghubungkan ke WiFi |
| `WiFi: GAGAL!` | WiFi gagal, retry... |
| `Mencari Server` / `bpm-server` | Mencari server backend via mDNS |
| `Server Tak Ditemukan` | mDNS gagal — cek hostname |
| `Server: Connect` / `IP:PORT` | Menyambungkan WebSocket |
| `Server: PUTUS!` | Koneksi server terputus |
| `Server Terhubung` | Siap monitoring |
| `BPM: 72 SpO2: 98%` | **Monitoring** — data normal |
| `Tempelkan Jari!` | Jari belum terdeteksi |
| `Send:5 Fail:0` | Statistik pengiriman |
| `Sensor ERROR!` | MAX30100 bermasalah |

## 🔍 Troubleshooting

### ESP8266 Tidak Masuk Config Portal
- Tekan tombol **RESET** atau **FLASH** saat boot
- Jika masih tidak muncul, flash ulang firmware

### Server Tidak Ditemukan
1. Pastikan server backend menyala (`npm run dev`)
2. Di Config Portal, isi **Server Hostname** pakai IP langsung (contoh: `192.168.1.100`)
3. Coba ping `bpm-server.local` dari laptop — apakah ter-resolve?

### MAX30100 Tidak Terdeteksi
1. Cek kabel I2C (SCL/SDA jangan terbalik)
2. Tegangan MAX30100 harus **3.3V** (bukan 5V!)
3. Turunkan I2C clock di file .ino: cari `#define I2C_CLOCK_HZ 100000` → ganti jadi `50000`

### BPM / SpO₂ Tidak Stabil
- Tempelkan jari dengan tenang
- Sesuaikan `SENSOR_IR_LED_CURRENT` di file .ino
- Kurangi pencahayaan ruangan

## 🔐 Keamanan

> **Peringatan:** API Key dikirim dalam bentuk **plaintext** via WebSocket. Di sisi server, API Key di-hash dengan SHA-256 sebelum disimpan. Gunakan koneksi **HTTPS/WSS** untuk production.

## 📦 Struktur File

```
esp8266-max30100/
├── esp8266-max30100.ino   ← FIRMWARE UTAMA (buka di Arduino IDE)
├── platformio.ini         ← Opsional, untuk PlatformIO user
└── README.md              ← Dokumentasi ini
```

> Semua konfigurasi sudah menyatu dalam satu file `.ino` — tidak perlu `config.h` lagi. Konfigurasi dilakukan via **web browser** saat Config Portal aktif.

## 🔗 Integrasi Backend (mDNS)

Agar mDNS discovery berjalan optimal, tambahkan script kecil di server Node.js:

```javascript
// Di file backend/src/index.ts, tambahkan:
import Bonjour from 'bonjour-service';
const bonjour = new Bonjour();
bonjour.publish({
  name: 'bpm-server',
  type: 'bpm-monitor',
  port: 5000,
});
```

Install package: `npm install bonjour-service`
