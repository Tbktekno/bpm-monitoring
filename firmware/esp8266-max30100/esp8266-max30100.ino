// =============================================================================
// ESP8266 BPM & SpO₂ Monitoring Firmware
// =============================================================================
// Hardware:
//   - ESP8266 (NodeMCU v3 / Wemos D1 Mini / ESP-01)
//   - MAX30100 Pulse Oximeter Sensor
//   - LCD I2C 16x2 (PCF8574 backpack)
//
// Fitur:
//   - WiFi Config Mode (Captive Portal) — pertama kali atau WiFi gagal
//   - mDNS — auto-detect server backend (bpm-server.local)
//   - HTTP POST — kirim data ke BPM Monitoring Dashboard REST API
//   - LCD — tampilkan BPM, SpO₂, status koneksi
//
// Protocol HTTP:
//   POST /api/v1/readings/device
//   Headers: Content-Type, x-api-key, x-device-id
//   Body: {"bpm": 75, "spo2": 98}
//   Response: HTTP 201 → { readingId, status }
// =============================================================================

// ═════════════════════════════════════════════════════════════════════════════
//  INCLUDES
// ═════════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <LittleFS.h>               // File-based config storage (menggantikan EEPROM)
#include <ESP8266HTTPClient.h>      // HTTP client untuk POST readings & health check
#include <WiFiClient.h>
#include <ESP8266WebServer.h>       // Web server untuk config portal
#include <ctype.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <MAX30100_PulseOximeter.h>
#include <ArduinoJson.h>            // Hanya untuk config persistence (load/save LittleFS)

// ═════════════════════════════════════════════════════════════════════════════
//  DEFAULT CONFIGURATION (compile-time)
//  Nilai ini dipakai pertama kali atau setelah LittleFS/config.json direset.
//  Setelah konfigurasi via web, nilai disimpan di LittleFS (/config.json).
// ═════════════════════════════════════════════════════════════════════════════

// ── Server Backend ────────────────────────────────────────────────────────────
#define DEFAULT_SERVER_HOST     "bpm-server"
#define DEFAULT_SERVER_PORT     5000

// ── Identitas Perangkat (default — ubah via web config) ─────────────────────
// ⚠ HARUS cocok dengan data di database (tabel Esp32Device)!
//    deviceId   = "ESP8266-ALPHA-001" → Device ID terbaru di tabel Esp32Device
//    apiKey     = "bpm-sample-alpha-key-001" → plaintext, backend akan hash & compare
//    patientId  = 1 → pastikan patient dengan ID ini ada
#define DEFAULT_DEVICE_ID       "ESP8266-ALPHA-001"
#define DEFAULT_API_KEY         "bpm-sample-alpha-key-001"
#define DEFAULT_PATIENT_ID      1

// ── Timing ──────────────────────────────────────────────────────────────────
#define SEND_INTERVAL_MS        3000
#define LCD_UPDATE_INTERVAL_MS  500

// ── I2C Pin ─────────────────────────────────────────────────────────────────
#define I2C_SDA_PIN             4   // GPIO4 (D2)
#define I2C_SCL_PIN             5   // GPIO5 (D1)
#define I2C_CLOCK_HZ            100000

// ── LCD ─────────────────────────────────────────────────────────────────────
#define LCD_I2C_ADDR            0x27    // Coba 0x3F jika tidak terdeteksi
#define LCD_COLS                16
#define LCD_ROWS                2

// ── MAX30100 ────────────────────────────────────────────────────────────────
#define SENSOR_IR_LED_CURRENT   MAX30100_LED_CURR_50MA

// ── LittleFS Config File ────────────────────────────────────────────────────
#define CONFIG_FILE             "/config.json"
#define CONFIG_FILE_MAX_SIZE    1024

// ── AP Config Portal ────────────────────────────────────────────────────────
#define AP_SSID                 "BPM-Monitor-Setup"
#define AP_PASSWORD             ""

// ═════════════════════════════════════════════════════════════════════════════
//  GLOBAL OBJECTS
// ═════════════════════════════════════════════════════════════════════════════

LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);
PulseOximeter pox;

// ═════════════════════════════════════════════════════════════════════════════
//  RUNTIME CONFIG (dimuat dari LittleFS /config.json)
// ═════════════════════════════════════════════════════════════════════════════

String    cfgServerHost   = DEFAULT_SERVER_HOST;
uint16_t  cfgServerPort   = DEFAULT_SERVER_PORT;
String    cfgDeviceId     = DEFAULT_DEVICE_ID;
String    cfgApiKey       = DEFAULT_API_KEY;
uint16_t  cfgPatientId    = DEFAULT_PATIENT_ID;

// Hasil resolve server
IPAddress cfgServerIP;
bool      cfgServerResolved = false;

// Config Portal Web Server
ESP8266WebServer configServer(80);
bool      inConfigMode = false;

// ═════════════════════════════════════════════════════════════════════════════
//  STATE MACHINE
// ═════════════════════════════════════════════════════════════════════════════

enum class DeviceState : uint8_t {
  BOOTING,             // Inisialisasi
  WIFI_CONFIG,         // Mode konfigurasi (captive portal)
  WIFI_CONNECTING,     // Menghubungkan WiFi
  WIFI_RETRY,          // WiFi gagal, retry
  MDNS_RESOLVING,      // Mencari server via mDNS / DNS
  MDNS_RETRY,          // mDNS gagal, retry
  MONITORING,          // Mode utama — baca sensor & kirim data via HTTP
  SENSOR_ERROR         // Sensor bermasalah
};

DeviceState currentState = DeviceState::BOOTING;
DeviceState lastState    = DeviceState::BOOTING;

// ═════════════════════════════════════════════════════════════════════════════
//  SENSOR DATA & TIMERS
// ═════════════════════════════════════════════════════════════════════════════

static float   currentBpm     = 0.0f;
static float   currentSpo2    = 0.0f;
static bool    sensorReady    = false;

// 🔴 Deteksi jari — sederhana, langsung dari library (seperti test-max30100.ino)
//    Library MAX30100 sudah handle deteksi jari internal.
//    Saat jari lepas, getHeartRate() akan return 0 setelah ~3 detik.
//    TIDAK perlu lastBeatTime / FINGER_TIMEOUT game — library handle sendiri!
static bool    jariAda       = false;  // Apakah jari sedang menempel?

static uint32_t lastSendMs      = 0;
static uint32_t lastLcdUpdateMs = 0;
static uint32_t retryStartMs    = 0;

static const uint32_t WIFI_RETRY_DELAY_MS  = 15000;
static const uint32_t MDNS_RETRY_DELAY_MS  = 10000;
static const uint32_t SENSOR_RETRY_DELAY_MS = 30000;

static uint32_t readingsSent   = 0;
static uint32_t readingsFailed = 0;
static uint32_t reconnectCount = 0;

// ═════════════════════════════════════════════════════════════════════════════
//  SAFETY NET — watchdog nilai stuck
//  Jika BPM tidak berubah selama WATCHDOG_TIMEOUT_MS, reset FIFO paksa
// ═════════════════════════════════════════════════════════════════════════════
static float    lastGoodBpm        = 0.0f;
static uint32_t lastGoodBpmChange  = 0;
static const uint32_t WATCHDOG_TIMEOUT_MS = 15000;  // 15 detik tanpa perubahan

// ═════════════════════════════════════════════════════════════════════════════
//  FORWARD DECLARATIONS
// ═════════════════════════════════════════════════════════════════════════════

void onBeatDetected();
void sendReading();
void resetSensorFifo();
void catchUpSensor();
void updateDisplay();
void setState(DeviceState newState);
void initWiFi();
void initSensor();
void initLCD();
void resolveServer();       // mDNS + DNS discovery (menggantikan UDP broadcast)
void loadConfig();          // Load dari LittleFS /config.json
void saveConfig();          // Simpan ke LittleFS /config.json
void setDefaults();         // Pakai nilai default compile-time
void deleteConfig();        // Hapus config file + format LittleFS
void startConfigPortal();   // Config Portal (mode AP)

// ═════════════════════════════════════════════════════════════════════════════
//  LITTLEFS — LOAD / SAVE CONFIG
//  Pattern: rfid-attendance menggunakan LittleFS /config.json
// ═════════════════════════════════════════════════════════════════════════════

void loadConfig() {
  // Mount LittleFS
  if (!LittleFS.begin()) {
    Serial.println("[CFG] LittleFS mount gagal! Format...");
    LittleFS.format();
    if (!LittleFS.begin()) {
      Serial.println("[CFG] LittleFS masih gagal! Pakai default.");
      setDefaults();
      return;
    }
  }

  // Cek apakah file config ada
  if (!LittleFS.exists(CONFIG_FILE)) {
    Serial.println("[CFG] File config tidak ditemukan. Pakai default.");
    setDefaults();
    saveConfig(); // Simpan default ke file
    return;
  }

  // Buka dan baca file
  File file = LittleFS.open(CONFIG_FILE, "r");
  if (!file) {
    Serial.println("[CFG] Gagal buka file config! Pakai default.");
    setDefaults();
    return;
  }

  String raw = file.readString();
  file.close();

  // Parse JSON
  StaticJsonDocument<CONFIG_FILE_MAX_SIZE> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    Serial.printf("[CFG] Parse error: %s. Pakai default.\n", err.c_str());
    setDefaults();
    return;
  }

  cfgServerHost = doc["serverHost"] | DEFAULT_SERVER_HOST;
  cfgServerPort = doc["serverPort"] | DEFAULT_SERVER_PORT;
  cfgDeviceId   = doc["deviceId"]   | DEFAULT_DEVICE_ID;
  cfgApiKey     = doc["apiKey"]     | DEFAULT_API_KEY;
  cfgPatientId  = doc["patientId"]  | DEFAULT_PATIENT_ID;

  Serial.printf("[CFG] Loaded: device=%s server=%s:%d patient=%u\n",
                cfgDeviceId.c_str(), cfgServerHost.c_str(), cfgServerPort, cfgPatientId);
}

void setDefaults() {
  cfgServerHost = DEFAULT_SERVER_HOST;
  cfgServerPort = DEFAULT_SERVER_PORT;
  cfgDeviceId   = DEFAULT_DEVICE_ID;
  cfgApiKey     = DEFAULT_API_KEY;
  cfgPatientId  = DEFAULT_PATIENT_ID;
  Serial.println("[CFG] Defaults applied");
}

void saveConfig() {
  // Pastikan LittleFS ter-mount
  if (!LittleFS.begin()) {
    LittleFS.format();
    LittleFS.begin();
  }

  // Buat JSON document
  StaticJsonDocument<CONFIG_FILE_MAX_SIZE> doc;
  doc["serverHost"] = cfgServerHost;
  doc["serverPort"] = cfgServerPort;
  doc["deviceId"]   = cfgDeviceId;
  doc["apiKey"]     = cfgApiKey;
  doc["patientId"]  = cfgPatientId;

  // Tulis ke file
  File file = LittleFS.open(CONFIG_FILE, "w");
  if (!file) {
    Serial.println("[CFG] Gagal buka file untuk menulis!");
    return;
  }

  if (serializeJson(doc, file) == 0) {
    Serial.println("[CFG] Gagal serialize config!");
  } else {
    Serial.println("[CFG] Saved to LittleFS /config.json");
  }
  file.close();
}

void deleteConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists(CONFIG_FILE)) {
      LittleFS.remove(CONFIG_FILE);
      Serial.println("[CFG] Config deleted!");
    }
    LittleFS.format(); // Format total agar bersih
    Serial.println("[CFG] LittleFS formatted!");
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CONFIG PORTAL — Web-based Configuration (AP Mode)
//  Pattern: rfid-attendance menggunakan ESP8266WebServer + HTML form
// ═════════════════════════════════════════════════════════════════════════════

// HTML form untuk config portal (inline di PROGMEM)
const char CONFIG_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BPM Monitor - Config</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh;padding:20px}
.container{max-width:480px;margin:0 auto;background:#16213e;border-radius:12px;padding:24px}
h1{color:#0f9b8e;font-size:20px;margin-bottom:8px;text-align:center}
p.sub{color:#889;font-size:13px;text-align:center;margin-bottom:20px}
label{display:block;margin-top:12px;font-size:13px;color:#aab;font-weight:600}
input{width:100%;padding:10px 12px;margin-top:4px;background:#0f3460;border:1px solid #1a5276;border-radius:8px;color:#fff;font-size:14px}
input:focus{outline:none;border-color:#0f9b8e}
.btn{width:100%;padding:12px;margin-top:20px;background:#0f9b8e;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer}
.btn:hover{background:#0c7d72}
.row{display:flex;gap:8px}
.row input{flex:1}
.status{margin-top:12px;padding:8px;border-radius:6px;text-align:center;font-size:13px;display:none}
.status.ok{display:block;background:#1a5276;color:#0f9b8e}
.status.err{display:block;background:#4a1a1a;color:#e74c3c}
</style>
</head><body>
<div class="container">
<h1>🔧 Konfigurasi BPM Monitor</h1>
<p class="sub">ESP8266 v2.1 — MAX30100</p>
<form id="cfg" action="/save" method="post">
<label>WiFi SSID</label>
<input type="text" name="wifi_ssid" placeholder="Nama WiFi" value="">
<label>WiFi Password</label>
<input type="password" name="wifi_pass" placeholder="Password WiFi">
<label>Server Hostname / IP</label>
<input type="text" name="srv_host" placeholder="bpm-server atau IP" value="%HOST%">
<div class="row">
<div><label>Port</label><input type="number" name="srv_port" value="%PORT%"></div>
<div><label>Patient ID</label><input type="number" name="pat_id" value="%PATIENT%"></div>
</div>
<label>Device ID</label>
<input type="text" name="dev_id" value="%DEVICE%">
<label>API Key</label>
<input type="text" name="api_key" value="%APIKEY%">
<button type="submit" class="btn">Simpan & Reboot</button>
</form>
<div id="status" class="status"></div>
</div>
</body></html>
)rawliteral";

void handleConfigRoot() {
  String html = FPSTR(CONFIG_HTML);
  html.replace("%HOST%",   cfgServerHost);
  html.replace("%PORT%",   String(cfgServerPort));
  html.replace("%PATIENT%", String(cfgPatientId));
  html.replace("%DEVICE%", cfgDeviceId);
  html.replace("%APIKEY%", cfgApiKey);
  configServer.send(200, "text/html", html);
}

void handleConfigSave() {
  // Baca form
  String wifiSsid  = configServer.arg("wifi_ssid");
  String wifiPass  = configServer.arg("wifi_pass");
  String srvHost   = configServer.arg("srv_host");
  String srvPort   = configServer.arg("srv_port");
  String devId     = configServer.arg("dev_id");
  String apiKey    = configServer.arg("api_key");
  String patId     = configServer.arg("pat_id");

  // Update runtime config
  cfgServerHost = srvHost.length() > 0 ? srvHost : DEFAULT_SERVER_HOST;
  cfgServerPort = (uint16_t)srvPort.toInt();
  if (cfgServerPort == 0) cfgServerPort = DEFAULT_SERVER_PORT;
  cfgDeviceId   = devId.length() > 0   ? devId   : DEFAULT_DEVICE_ID;
  cfgApiKey     = apiKey.length() > 0  ? apiKey  : DEFAULT_API_KEY;
  cfgPatientId  = (uint16_t)patId.toInt();
  if (cfgPatientId == 0) cfgPatientId = DEFAULT_PATIENT_ID;

  // Simpan ke LittleFS
  saveConfig();

  // Kirim response sukses
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Saved</title><style>body{background:#1a1a2e;color:#0f9b8e;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial;text-align:center}.box{background:#16213e;padding:30px;border-radius:12px}h2{margin-bottom:10px}p{color:#889;font-size:14px}</style></head><body><div class='box'><h2>✅ Konfigurasi Tersimpan!</h2><p>Reboot dalam 2 detik...</p></div></body></html>";

  // Simpan WiFi credentials dan reboot
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  configServer.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

void startConfigPortal() {
  Serial.println("[CFG] Starting config portal...");
  setState(DeviceState::WIFI_CONFIG);
  inConfigMode = true;

  // Setup Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[CFG] AP started: %s (IP: %s)\n", AP_SSID, apIP.toString().c_str());

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Config Mode");
  lcd.setCursor(0, 1); lcd.print(apIP);

  // Setup web server
  configServer.on("/", handleConfigRoot);
  configServer.on("/save", HTTP_POST, handleConfigSave);
  configServer.begin();

  Serial.printf("[CFG] Web server: http://%s\n", apIP.toString().c_str());

  // Loop config portal
  while (inConfigMode) {
    configServer.handleClient();
    updateDisplay();
    yield();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SERVER DISCOVERY — Multi-method: IP → DNS → mDNS
//  Pattern: rfid-attendance menggunakan mDNS queryService sebagai primer
//  TIDAK menggunakan UDP broadcast!
// ═════════════════════════════════════════════════════════════════════════════

void resolveServer() {
  setState(DeviceState::MDNS_RESOLVING);
  cfgServerResolved = false;

  // ── Coba 1: Apakah sudah berupa IP address? ───────────────────────────────
  if (cfgServerIP.fromString(cfgServerHost)) {
    cfgServerResolved = true;
    Serial.printf("[DISC] IP langsung: %s\n", cfgServerIP.toString().c_str());
    return;
  }

  // ── Coba 2: Resolve via DNS (hostname) ────────────────────────────────────
  IPAddress resolvedIP;
  bool dnsOk = (WiFi.hostByName(cfgServerHost.c_str(), resolvedIP) == 1);

  if (!dnsOk) {
    // Coba dengan suffix .local (mDNS hostname)
    String withLocal = String(cfgServerHost) + ".local";
    dnsOk = (WiFi.hostByName(withLocal.c_str(), resolvedIP) == 1);
  }

  if (dnsOk) {
    cfgServerIP = resolvedIP;
    cfgServerResolved = true;
    Serial.printf("[DISC] DNS: %s -> %s\n",
                  cfgServerHost.c_str(), cfgServerIP.toString().c_str());
    return;
  }

  // ── Coba 3: Service Discovery via mDNS ────────────────────────────────────
  Serial.println("[DISC] mDNS query _bpm-monitor._tcp...");
  MDNS.begin("esp8266-monitor");
  int n = MDNS.queryService("bpm-monitor", "tcp");
  if (n > 0) {
    for (int i = 0; i < n; i++) {
      String h = MDNS.hostname(i);
      h.toLowerCase();
      if (h.indexOf(cfgServerHost) >= 0 || cfgServerHost.indexOf(h) >= 0) {
        cfgServerIP = MDNS.IP(i);
        cfgServerResolved = true;
        if (MDNS.port(i) > 0) cfgServerPort = MDNS.port(i);
        Serial.printf("[DISC] mDNS matched: %s:%d\n",
                      cfgServerIP.toString().c_str(), cfgServerPort);
        return;
      }
    }
    // Pakai yang pertama
    cfgServerIP = MDNS.IP(0);
    cfgServerResolved = true;
    Serial.printf("[DISC] mDNS first: %s\n", cfgServerIP.toString().c_str());
    return;
  }

  // ── Semua gagal ───────────────────────────────────────────────────────────
  Serial.printf("[DISC] FAILED to find server: %s\n", cfgServerHost.c_str());
  cfgServerResolved = false;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAX30100 CALLBACK
// ═════════════════════════════════════════════════════════════════════════════

void onBeatDetected() {
  // Library callback — tidak perlu logika khusus
  // Cukup print debug saja (mirip test-max30100.ino)
  Serial.println("[BEAT] ♥");
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAX30100 FIFO RESET — paksa reset pointer FIFO via I2C langsung
//  ⚠ Library MAX30100 punya bug: saat pox.update() tidak dipanggil lama
//     (misal: HTTP POST blocking 3 detik), FIFO overflow dan write/read
//     pointer jadi out-of-sync. Akibatnya readFifoData() return 0 sampel.
//     Fungsi ini nulis 0 ke semua register pointer FIFO untuk bersihin state.
// ═════════════════════════════════════════════════════════════════════════════

void resetSensorFifo() {
  // I2C: MAX30100 address = 0x57
  // Register 0x02 = FIFO_WRITE_POINTER
  // Register 0x03 = FIFO_OVERFLOW_COUNTER
  // Register 0x04 = FIFO_READ_POINTER
  Wire.beginTransmission(0x57);
  Wire.write(0x02);   // Start at WRITE_POINTER reg
  Wire.write(0x00);   // WRITE_POINTER = 0
  Wire.write(0x00);   // OVERFLOW_COUNTER = 0
  Wire.write(0x00);   // READ_POINTER = 0
  Wire.endTransmission();
}

// ═════════════════════════════════════════════════════════════════════════════
//  Baca ulang FIFO — panggil pox.update() beberapa kali untuk ngejar backlog
//  Pattern: seperti warm-up di initSensor(), baca 50 sampel untuk flush FIFO
// ═════════════════════════════════════════════════════════════════════════════

void catchUpSensor() {
  for (int i = 0; i < 10; i++) {
    pox.update();
    delay(2);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SEND READING VIA HTTP POST
//  Menggantikan Socket.IO — kirim data sebagai JSON via HTTP POST ke backend.
// ═════════════════════════════════════════════════════════════════════════════

void sendReading() {
  // Jangan kirim jika tidak ada data valid (jari belum terdeteksi)
  // Pattern: test-max30100.ino — langsung dari library, tanpa lapisan logika
  if (currentBpm <= 0.0f || currentSpo2 <= 0.0f) return;
  // Filter nilai tidak realistis
  if (currentBpm < 30.0f || currentBpm > 250.0f) return;

  // ⚠ Reset FIFO SEBELUM HTTP — biar pointer sensor gak kacau selama blocking
  //    HTTP POST butuh ~500ms-3dtk, selama itu pox.update() gak dipanggil
  //    FIFO overflow → pointer out-of-sync → nilai stuck!
  resetSensorFifo();

  int bpm  = (int)(currentBpm + 0.5f);
  int spo2 = (int)(currentSpo2 + 0.5f);

  WiFiClient client;
  HTTPClient http;

  String url = String("http://") + cfgServerIP.toString() + ":" + cfgServerPort + "/api/v1/readings/device";

  http.setTimeout(3000);  // ⚠ Max 3 detik — jangan terlalu lama! MAX30100 FIFO overflow!
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", cfgApiKey);
  http.addHeader("x-device-id", cfgDeviceId);

  // Body JSON — manual concat untuk hindari dependensi ArduinoJson di jalur data
  String body = "{\"bpm\":" + String(bpm) + ",\"spo2\":" + String(spo2) + "}";

  int code = http.POST(body);

  if (code == 201) {
    readingsSent++;
    Serial.printf("[SEND] ✅ BPM=%d SpO2=%d%% | HTTP %d | Total=%u\n",
                  bpm, spo2, code, readingsSent);
  } else {
    readingsFailed++;
    Serial.printf("[SEND] ❌ HTTP %d | BPM=%d SpO2=%d%% | Gagal=%u\n",
                  code, bpm, spo2, readingsFailed);
  }

  http.end();

  // ⚠ Catch-up SETELAH HTTP — baca ulang FIFO yang mungkin terisi selama blocking
  catchUpSensor();
}

// ═════════════════════════════════════════════════════════════════════════════
//  LCD DISPLAY
// ═════════════════════════════════════════════════════════════════════════════

void updateDisplay() {
  uint32_t now = millis();
  if (now - lastLcdUpdateMs < LCD_UPDATE_INTERVAL_MS) return;
  lastLcdUpdateMs = now;

  char line1[17], line2[17];

  switch (currentState) {
    case DeviceState::BOOTING:
      snprintf(line1, sizeof(line2), "System Booting..");
      snprintf(line2, sizeof(line2), "Vital Sign Mon.");
      break;

    case DeviceState::WIFI_CONFIG:
      snprintf(line1, sizeof(line2), "Config Mode");
      snprintf(line2, sizeof(line2), "AP: BPM-Monitor");
      break;

    case DeviceState::WIFI_CONNECTING:
      snprintf(line1, sizeof(line2), "WiFi: Connecting");
      snprintf(line2, sizeof(line2), "");
      break;

    case DeviceState::WIFI_RETRY:
      snprintf(line1, sizeof(line2), "WiFi: GAGAL!");
      snprintf(line2, sizeof(line2), "Retry %ds..", WIFI_RETRY_DELAY_MS / 1000);
      break;

    case DeviceState::MDNS_RESOLVING:
      snprintf(line1, sizeof(line2), "Mencari Server");
      snprintf(line2, sizeof(line2), "%.15s", cfgServerHost.c_str());
      break;

    case DeviceState::MDNS_RETRY:
      snprintf(line1, sizeof(line2), "Server Tak Ditemukan");
      snprintf(line2, sizeof(line2), "Cek hostname & mDNS");
      break;

    case DeviceState::MONITORING:
      if (!sensorReady) {
        snprintf(line1, sizeof(line1), "Sensor Error!");
        snprintf(line2, sizeof(line2), "Retry...");
      } else if (currentBpm > 0 && currentSpo2 > 0) {
        // Baris 1: BPM + SpO2 + status pasien
        snprintf(line1, sizeof(line1), "BPM:%3d SpO2:%3d%%",
                 (int)(currentBpm + 0.5f), (int)(currentSpo2 + 0.5f));
        // Baris 2: info device + jumlah kirim
        snprintf(line2, sizeof(line2), "P:%s S:%u",
                 cfgDeviceId.substring(9, 14).c_str(), // Cuplik device ID (ALPHA/BETA/GAMMA)
                 readingsSent);
      } else {
        snprintf(line1, sizeof(line1), "Tempelkan Jari!");
        snprintf(line2, sizeof(line2), "P:%s Terkoneksi            ",
                 cfgDeviceId.substring(9, 14).c_str());
      }
      break;

    case DeviceState::SENSOR_ERROR:
      snprintf(line1, sizeof(line2), "Sensor ERROR!");
      snprintf(line2, sizeof(line2), "Cek koneksi I2C");
      break;
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
}

// ═════════════════════════════════════════════════════════════════════════════
//  STATE MACHINE
// ═════════════════════════════════════════════════════════════════════════════

void setState(DeviceState newState) {
  if (newState == currentState) return;
  lastState = currentState;
  currentState = newState;
  Serial.printf("[STATE] %d -> %d\n", (int)lastState, (int)newState);
}

// ═════════════════════════════════════════════════════════════════════════════
//  WIFI
// ═════════════════════════════════════════════════════════════════════════════

void initWiFi() {
  Serial.printf("[WiFi] Connecting to saved network...\n");
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
  WiFi.hostname(cfgDeviceId);
  WiFi.begin();  // Gunakan kredensial yang tersimpan
  setState(DeviceState::WIFI_CONNECTING);
}

// ═════════════════════════════════════════════════════════════════════════════
//  SENSOR INIT
// ═════════════════════════════════════════════════════════════════════════════

void initSensor() {
  Serial.println("[SENSOR] MAX30100 init...");
  sensorReady = false;

  if (!pox.begin()) {
    Serial.println("[SENSOR] FAILED! Akan retry...");
    retryStartMs = millis();
    setState(DeviceState::SENSOR_ERROR);
    return;
  }

  pox.setIRLedCurrent(SENSOR_IR_LED_CURRENT);
  pox.setOnBeatDetectedCallback(onBeatDetected);
  sensorReady = true;
  retryStartMs = 0;

  // Warm-up: pastikan FIFO tidak overflow dengan membaca beberapa sampel
  Serial.println("[SENSOR] Warm-up...");
  for (int i = 0; i < 50; i++) {
    pox.update();
    delay(10);
  }
  Serial.printf("[SENSOR] ✅ OK — nilai awal: BPM=%.0f SpO2=%.0f\n",
                pox.getHeartRate(), pox.getSpO2());
}

// ═════════════════════════════════════════════════════════════════════════════
//  LCD INIT
// ═════════════════════════════════════════════════════════════════════════════

void initLCD() {
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("BPM & SpO2 Mon");
  lcd.setCursor(0, 1); lcd.print("System v2.1");
  Serial.println("[LCD] OK");
}

// ═════════════════════════════════════════════════════════════════════════════
//  SETUP
// ═════════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  Serial.println(F("\n================================="));
  Serial.println(F(" BPM & SpO2 Monitor v2.1"));
  Serial.println(F(" ESP8266 + MAX30100 + LCD I2C"));
  Serial.println(F(" Protocol: HTTP POST (no WebSocket)"));
  Serial.println(F("================================="));

  // ── I2C ──────────────────────────────────────────────────────────────────
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);

  // ── LCD ──────────────────────────────────────────────────────────────────
  initLCD();

  // ── Load config dari LittleFS ──────────────────────────────────────────
  loadConfig();

  // ═══════════════════════════════════════════════════════════════════════════
  //  FACTORY RESET — Tahan tombol FLASH (GPIO0) saat boot
  //  Menghapus semua konfigurasi di LittleFS, reboot ke Config Portal
  // ═══════════════════════════════════════════════════════════════════════════

  pinMode(0, INPUT_PULLUP);  // GPIO0 = FLASH button, active LOW
  bool factoryReset = (digitalRead(0) == LOW);

  if (factoryReset) {
    Serial.println(F("╔═══════════════════════════════════╗"));
    Serial.println(F("║      FACTORY RESET                ║"));
    Serial.println(F("╚═══════════════════════════════════╝"));

    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Factory Reset...");
    lcd.setCursor(0, 1); lcd.print("Hapus Semua Config");
    delay(1500);

    // Hapus config + WiFi credentials
    deleteConfig();
    WiFi.disconnect(true);
    delay(500);

    Serial.println(F("[RESET] Selesai! Reboot ke Config Portal..."));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Config Dihapus!");
    lcd.setCursor(0, 1); lcd.print("Reboot...");
    delay(2000);
    ESP.restart();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  KONEKSI WiFi — langsung ke jaringan yang tersimpan
  // ═══════════════════════════════════════════════════════════════════════════

  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
  WiFi.hostname(cfgDeviceId);

  WiFi.begin();
  Serial.printf("[WiFi] Menghubungkan... (SSID: %s)\n", WiFi.SSID().c_str());

  // Tunggu koneksi dengan timeout singkat
  int waitCount = 0;
  while (WiFi.status() != WL_CONNECTED && waitCount < 40) {  // 8 detik max
    delay(200);
    waitCount++;
    if (waitCount % 5 == 0) {
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print("WiFi: Connect");
      lcd.setCursor(0, 1);
      if (WiFi.SSID().length() > 0) {
        lcd.print(WiFi.SSID().substring(0, 15));
      } else {
        lcd.print("(no SSID saved)");
      }
    }
  }

  // ── Jika tidak terkoneksi → Config Portal ─────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Gagal -> Config Portal (AP Mode)");
    startConfigPortal();  // Blocking — setelah ini reboot
  } else {
    Serial.printf("[WiFi] Terkoneksi! IP: %s\n", WiFi.localIP().toString().c_str());
  }

  // ── mDNS — inisialisasi untuk query service ───────────────────────────
  MDNS.begin("esp8266-monitor");

  // ── Resolve server (mDNS + DNS, tanpa UDP broadcast) ──────────────────
  resolveServer();

  // ── Jika server belum ter-resolve, retry beberapa kali ────────────────
  int retryCount = 0;
  while (!cfgServerResolved && retryCount < 3) {
    Serial.printf("[DISC] Retry %d/3...\n", retryCount + 1);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Cari Server...");
    lcd.setCursor(0, 1); lcd.printf("Percobaan %d/3", retryCount + 1);
    delay(MDNS_RETRY_DELAY_MS);
    resolveServer();
    retryCount++;
  }

  // ── Health Check: cek apakah server backend hidup ─────────────────────
  // Informational only — tetap lanjut ke MONITORING meski server down
  if (cfgServerResolved) {
    WiFiClient client;
    HTTPClient http;
    String url = String("http://") + cfgServerIP.toString() + ":" + cfgServerPort + "/api/health";
    http.begin(client, url);
    http.setTimeout(3000);
    int healthCode = http.GET();
    if (healthCode == 200) {
      Serial.printf("[HLTH] Server OK (HTTP %d)\n", healthCode);
    } else {
      Serial.printf("[HLTH] Server unreachable (HTTP %d) — akan coba kirim data nanti\n", healthCode);
    }
    http.end();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MAX30100 INIT — PALING AKHIR setelah semua koneksi jaringan selesai!
  //  ⚠ KRITIS: MAX30100 punya FIFO internal hanya 16 sampel. Jika tidak
  //  dibaca (pox.update()) dalam ~0.2 detik, FIFO overflow dan sensor
  //  berhenti mengirim data. Makanya initSensor() harus SEBELUM loop().
  // ═══════════════════════════════════════════════════════════════════════════
  initSensor();

  // ── Timer ────────────────────────────────────────────────────────────────
  lastSendMs      = millis();
  lastLcdUpdateMs = millis();

  Serial.println(F("[SETUP] ✅ Complete!"));
  Serial.println(F("───────────────────────────────────"));
  Serial.printf(" Device : %s\n", cfgDeviceId.c_str());
  Serial.printf(" Server : %s:%d (%s)\n",
                cfgServerIP.toString().c_str(), cfgServerPort,
                cfgServerResolved ? "terhubung" : "tidak ditemukan");
  Serial.printf(" Pasien : ID %u\n", cfgPatientId);
  Serial.printf(" Sensor : %s\n", sensorReady ? "SIAP" : "ERROR - akan retry");
  Serial.println(F("───────────────────────────────────"));
  Serial.println(F(" Ketik 'help' untuk daftar perintah"));
  Serial.println(F("   help   → bantuan"));
  Serial.println(F("   portal → Config Portal (ubah server/IP)"));
  Serial.println(F("   reset  → factory reset (hapus semua)"));
  Serial.println(F("───────────────────────────────────"));
  Serial.println(F(""));
  Serial.println(F("========== DATA SENSOR REAL-TIME =========="));
  Serial.println(F(" Waktu      │ BPM  │ SpO2 │ Status"));
  Serial.println(F("────────────┼──────┼──────┼──────────────"));
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═════════════════════════════════════════════════════════════════════════════

void loop() {
  uint32_t now = millis();

  // ── 1. PulseOximeter update — WAJIB SETIAP LOOP! ─────────────────────────
  //    ⚠ KRITIS: MAX30100 FIFO internal hanya 16 sampel.
  //    Jika pox.update() tidak dipanggil setiap loop (~10ms),
  //    FIFO overflow dan library return NILAI LAMA (stuck)!
  //    (Pattern: test-max30100.ino — langsung baca nilai, tanpa lapisan logika)
  if (sensorReady) {
    pox.update();
    currentBpm  = pox.getHeartRate();
    currentSpo2 = pox.getSpO2();

    // Deteksi jari — sederhana, langsung dari library (seperti test-max30100.ino)
    // Saat jari lepas, library akan return 0 setelah beberapa detik.
    // TIDAK PERLU lastBeatTime / FINGER_TIMEOUT / stabilizing — library handle sendiri!
    jariAda = (currentBpm > 0.0f && currentSpo2 > 0.0f);

    // ⚡ Stuck-value watchdog: jika BPM tidak berubah > 15 detik padahal jari terdeteksi
    //    → reset FIFO paksa (antisipasi bug library MAX30100)
    if (jariAda) {
      int curBpm = (int)(currentBpm + 0.5f);
      if (curBpm != (int)(lastGoodBpm + 0.5f)) {
        lastGoodBpm = currentBpm;
        lastGoodBpmChange = now;
      } else if (now - lastGoodBpmChange > WATCHDOG_TIMEOUT_MS) {
        Serial.printf("[WATCHDOG] ⚠ BPM stuck di %d selama 15dtk! Reset FIFO...\n", curBpm);
        resetSensorFifo();
        catchUpSensor();
        lastGoodBpmChange = now;  // Reset timer biar gak loop reset terus
      }
    } else {
      // Jari lepas — reset watchdog timer
      lastGoodBpm = 0;
      lastGoodBpmChange = now;
    }

    // Cetak data sensor ke Serial Monitor setiap detik (format tabel)
    // Pattern: test-max30100.ino
    static uint32_t lastSerialPrint = 0;
    if (now - lastSerialPrint >= 1000) {
      lastSerialPrint = now;

      uint32_t sec = now / 1000;
      uint8_t s = sec % 60;
      uint8_t m = (sec / 60) % 60;
      uint8_t h = (sec / 3600) % 24;

      if (jariAda) {
        int bpm = (int)(currentBpm + 0.5f);
        int spo2 = (int)(currentSpo2 + 0.5f);

        // Status klinis
        const char* status = "NORMAL";
        if (bpm < 60) status = "BRADICARDIA";
        else if (bpm > 100) status = "TAKIKARDIA";
        if (spo2 < 95) status = (bpm < 60 || bpm > 100) ? "DARURAT" : "HIPOKSEMIA";

        Serial.printf(" %02d:%02d:%02d  │   %3d  │  %3d  │ %s  ♥\n",
                      h, m, s, bpm, spo2, status);
      } else {
        Serial.printf(" %02d:%02d:%02d  │   --- │  --- │ ❌ Jari tidak terdeteksi\n",
                      h, m, s);
      }
    }
  }

  // ── 2. State Machine ─────────────────────────────────────────────────────
  switch (currentState) {

    case DeviceState::BOOTING:
      // Setup selesai — langsung masuk MONITORING
      // Tidak perlu nunggu WebSocket/socket seperti versi sebelumnya
      Serial.println("[STATE] Setup selesai, masuk MONITORING");
      setState(DeviceState::MONITORING);
      break;

    case DeviceState::WIFI_CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
        setState(DeviceState::MDNS_RESOLVING);
      } else if (WiFi.status() == WL_CONNECT_FAILED ||
                 WiFi.status() == WL_NO_SSID_AVAIL) {
        retryStartMs = now;
        setState(DeviceState::WIFI_RETRY);
      }
      break;

    case DeviceState::WIFI_RETRY:
      if (now - retryStartMs >= WIFI_RETRY_DELAY_MS) {
        WiFi.reconnect();
        setState(DeviceState::WIFI_CONNECTING);
      }
      break;

    case DeviceState::MDNS_RESOLVING:
      // Jika server belum ter-resolve, coba lagi secara periodik
      if (!cfgServerResolved) {
        if (now - retryStartMs >= MDNS_RETRY_DELAY_MS) {
          resolveServer();
        }
      } else {
        // Server resolved — masuk monitoring
        Serial.println("[STATE] Server ditemukan, masuk MONITORING");
        setState(DeviceState::MONITORING);
      }
      break;

    case DeviceState::MDNS_RETRY:
      if (now - retryStartMs >= MDNS_RETRY_DELAY_MS) {
        resolveServer();
      }
      break;

    case DeviceState::MONITORING:
      // Cek WiFi
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[MON] WiFi lost!");
        retryStartMs = now;
        setState(DeviceState::WIFI_RETRY);
        break;
      }

      // Jika server belum ter-resolve, coba resolve ulang
      if (!cfgServerResolved) {
        Serial.println("[MON] Server not resolved, re-resolving...");
        resolveServer();
        // Tetap di MONITORING — data akan dikirim setelah server ter-resolve
        break;
      }

      // ── Sensor retry — jika sensor gagal, coba lagi setiap 5 detik ────
      if (!sensorReady) {
        if (now - retryStartMs >= 5000) {
          Serial.println("[MON] Retry sensor init...");
          initSensor();
          retryStartMs = now;
        }
        // Jangan kirim data — sensor belum siap
        break;
      }

      // ── Sensor sudah di-update di awal loop() — langsung kirim ──────
      // Nilai currentBpm/currentSpo2 sudah fresh dari pox.update() di atas

      // ── Kirim data periodik ──────────────────────────────────────────
      if (now - lastSendMs >= SEND_INTERVAL_MS) {
        lastSendMs = now;
        sendReading();
      }
      break;

    case DeviceState::SENSOR_ERROR:
      if (retryStartMs == 0) retryStartMs = now; // Init timer saat pertama masuk
      if (now - retryStartMs >= SENSOR_RETRY_DELAY_MS) {
        Serial.println("[SENSOR] Retrying init...");
        retryStartMs = now;
        initSensor();
        if (sensorReady) {
          retryStartMs = 0;
          setState(DeviceState::MONITORING);
        }
      }
      break;

    default:
      break;
  }

  // ── 3. Handle perintah Serial Monitor ────────────────────────────────────
  // Perintah: reset / rst → hapus WiFi + reboot ke Config Portal
  // Bisa dikirim dengan atau tanpa newline — pasti diproses!
  static char serialBuf[32];
  static uint8_t serialIdx = 0;
  static uint32_t lastSerialChar = 0;

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      // Abaikan newline — tidak perlu nunggu enter
    } else if (serialIdx < sizeof(serialBuf) - 1) {
      serialBuf[serialIdx++] = c;
    }
    lastSerialChar = millis();
  }

  // Proses buffer jika: (a) ada data, DAN (b) sudah 300ms sejak karakter terakhir
  if (serialIdx > 0 && (millis() - lastSerialChar > 300)) {
    serialBuf[serialIdx] = '\0';

    // Konversi ke lowercase
    for (char *p = serialBuf; *p; p++) {
      if (*p >= 'A' && *p <= 'Z') *p += 32;
    }

    // Debug: tunjukkan apa yang diterima
    Serial.printf("[SERIAL] Cmd: \"%s\"\n", serialBuf);

    // Cek perintah: help
    if (strcmp(serialBuf, "help") == 0 || strcmp(serialBuf, "h") == 0 || strcmp(serialBuf, "?") == 0) {
      Serial.println(F("\n╔══════════════════════════════════╗"));
      Serial.println(F("║         AVAILABLE COMMANDS        ║"));
      Serial.println(F("╚══════════════════════════════════╝"));
      Serial.println(F("  help / h / ?  → tampilkan ini"));
      Serial.println(F("  portal / cfg  → buka Config Portal (ubah server/IP)"));
      Serial.println(F("  reset / rst   → hapus WiFi + reboot ke Config Portal"));
      Serial.println(F(""));
    }
    // Cek perintah: portal → masuk config portal via AP Mode
    else if (strcmp(serialBuf, "portal") == 0 || strcmp(serialBuf, "cfg") == 0) {
      Serial.println(F("\n╔══════════════════════════════════╗"));
      Serial.println(F("║     MEMBUKA CONFIG PORTAL         ║"));
      Serial.println(F("╚══════════════════════════════════╝"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print("Config Portal...");
      lcd.setCursor(0, 1); lcd.print("AP: BPM-Monitor-Setup");
      startConfigPortal();
      // Setelah config portal selesai, reboot
      ESP.restart();
    }
    // Cek perintah: reset → factory reset total
    else if (strcmp(serialBuf, "reset") == 0 ||
             strcmp(serialBuf, "rst") == 0 ||
             strcmp(serialBuf, "r") == 0) {
      Serial.println(F("\n╔══════════════════════════════════╗"));
      Serial.println(F("║     FACTORY RESET via Serial     ║"));
      Serial.println(F("╚══════════════════════════════════╝"));

      lcd.clear();
      lcd.setCursor(0, 0); lcd.print("FACTORY RESET...");
      lcd.setCursor(0, 1); lcd.print("Hapus Semua Data");
      Serial.println(F("[RESET] Menghapus config & WiFi..."));

      // Hapus config file dan format LittleFS
      deleteConfig();

      // Hapus WiFi credentials
      WiFi.disconnect(true);
      delay(200);
      WiFi.mode(WIFI_OFF);
      delay(200);
      Serial.println(F("[RESET] WiFi & Config dihapus!"));

      lcd.clear();
      lcd.setCursor(0, 0); lcd.print("Semua Dihapus!");
      lcd.setCursor(0, 1); lcd.print("Reboot ke Config...");
      Serial.println(F("[RESET] Reboot ke Config Portal..."));
      delay(2000);
      ESP.restart();
    }

    // Reset buffer untuk perintah berikutnya
    serialIdx = 0;
  }

  // ── 4. Update LCD ─────────────────────────────────────────────────────────
  updateDisplay();
}

// =============================================================================
// END OF FIRMWARE
// =============================================================================
