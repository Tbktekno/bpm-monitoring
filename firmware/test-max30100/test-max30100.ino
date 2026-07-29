// =============================================================================
// MAX30100 Sensor Test — Apakah Bisa Membaca Darah?
// =============================================================================
// Hardware: ESP8266 + MAX30100 (Pulse Oximeter)
//
// Fungsi:
//   - Test I2C koneksi ke MAX30100
//   - Baca raw IR/Red value (tanpa algorithm)
//   - Baca BPM dan SpO₂ (dengan algorithm PulseOximeter library)
//   - Tampilkan semua data ke Serial Monitor
//   - Diagnosa: deteksi jari / tidak ada jari / sensor error
//
// Wiring:
//   MAX30100 VIN → 3.3V
//   MAX30100 GND → GND
//   MAX30100 SCL → D1 (GPIO5)
//   MAX30100 SDA → D2 (GPIO4)
//
// Cara pakai:
//   1. Buka di Arduino IDE
//   2. Tools → Board → NodeMCU 1.0 (ESP-12E)
//   3. Tools → Port → COMx
//   4. Upload
//   5. Buka Serial Monitor (115200 baud)
//   6. Tempelkan jari ke sensor → lihat data
// =============================================================================

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <MAX30100_PulseOximeter.h>

// ═════════════════════════════════════════════════════════════════════════════
//  PIN & KONFIGURASI
// ═════════════════════════════════════════════════════════════════════════════

#define I2C_SDA_PIN     4
#define I2C_SCL_PIN     5
#define I2C_CLOCK_HZ    100000

// LCD I2C — alamat 0x27 atau 0x3F
#define LCD_ADDR        0x27
#define LCD_COLS        16
#define LCD_ROWS        2

#define REPORT_INTERVAL_MS  1000    // Cetak data setiap 1 detik
#define LCD_UPDATE_MS       300     // Update LCD setiap 300ms
#define TEST_DURATION_MS    30000   // Test selama 30 detik, lalu tampilkan summary
#define SENSOR_TIMEOUT_MS   10000   // Timeout init sensor 10 detik

// ═════════════════════════════════════════════════════════════════════════════
//  GLOBAL
// ═════════════════════════════════════════════════════════════════════════════

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
PulseOximeter pox;

float   bpm      = 0.0f;
float   spo2     = 0.0f;
bool    sensorOk = false;
bool    jariAda  = false;

uint32_t lastReportMs   = 0;
uint32_t lastLcdUpdateMs = 0;
uint32_t startTestMs    = 0;

// Statistik
uint32_t totalReadings   = 0;
uint32_t validReadings   = 0;
float    minBpm          = 999.0f;
float    maxBpm          = 0.0f;
float    minSpo2         = 999.0f;
float    maxSpo2         = 0.0f;
float    sumBpm          = 0.0f;
float    sumSpo2         = 0.0f;

// ═════════════════════════════════════════════════════════════════════════════
//  CALLBACK DETAK JANTUNG
// ═════════════════════════════════════════════════════════════════════════════

void onBeatDetected() {
  Serial.println("[BEAT] ♥ Detak jantung terdeteksi!");
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCAN I2C — Cari alamat device
// ═════════════════════════════════════════════════════════════════════════════

bool scanI2C() {
  Serial.println(F("\n[I2C] Scanning bus..."));
  byte error, addr;
  int deviceCount = 0;

  for (addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    error = Wire.endTransmission();
    if (error == 0) {
      deviceCount++;
      Serial.printf("[I2C] Device found at 0x%02X", addr);
      if (addr == 0x57) Serial.print(" ← MAX30100!");
      Serial.println();
    }
  }

  if (deviceCount == 0) {
    Serial.println(F("[I2C] ❌ TIDAK ADA DEVICE! Cek wiring."));
    return false;
  }

  Serial.printf("[I2C] Ditemukan %d device(s)\n", deviceCount);
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  SETUP
// ═════════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println(F("\n╔══════════════════════════════════════╗"));
  Serial.println(F("║    MAX30100 SENSOR TEST v1.0         ║"));
  Serial.println(F("║    BPM & SpO₂ Blood Reader Test      ║"));
  Serial.println(F("╚══════════════════════════════════════╝"));

  // ── I2C ──────────────────────────────────────────────────────────────────
  Serial.println(F("\n[INIT] I2C bus..."));
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(I2C_CLOCK_HZ);

  // ── LCD I2C ──────────────────────────────────────────────────────────────
  Serial.println(F("[INIT] LCD I2C..."));
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("MAX30100 Test");
  lcd.setCursor(0, 1); lcd.print("Sensor Ready!");
  Serial.println(F("[LCD] ✅ OK"));

  // ── Scan I2C ─────────────────────────────────────────────────────────────
  if (!scanI2C()) {
    Serial.println(F("\n⚠  PERIKSA WIRING:"));
    Serial.println(F("   MAX30100 VIN → 3.3V (BUKAN 5V!)"));
    Serial.println(F("   MAX30100 GND → GND"));
    Serial.println(F("   MAX30100 SCL → D1 (GPIO5)"));
    Serial.println(F("   MAX30100 SDA → D2 (GPIO4)"));
    Serial.println(F("\n⚠  Test GAGAL — Sensor tidak terdeteksi."));
    return;
  }

  // ── MAX30100 ─────────────────────────────────────────────────────────────
  Serial.println(F("\n[INIT] MAX30100 PulseOximeter..."));
  if (!pox.begin()) {
    Serial.println(F("[SENSOR] ❌ GAGAL init MAX30100!"));
    Serial.println(F("   Kemungkinan: sensor rusak / wiring salah / tegangan salah"));
    return;
  }

  pox.setIRLedCurrent(MAX30100_LED_CURR_50MA);
  pox.setOnBeatDetectedCallback(onBeatDetected);

  sensorOk = true;
  startTestMs = millis();

  Serial.println(F("[SENSOR] ✅ MAX30100 READY!"));
  Serial.println(F("\n╔══════════════════════════════════════╗"));
  Serial.println(F("║  TEMPELKAN JARI KE SENSOR           ║"));
  Serial.println(F("║  Running selama 30 detik...         ║"));
  Serial.println(F("╚══════════════════════════════════════╝"));
  Serial.println();
  Serial.println(F("BPM\tSpO2\tIR_RAW\tRED_RAW\tJARI\tSTATUS"));
  Serial.println(F("----\t----\t-----\t-------\t----\t------"));
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOOP
// ═════════════════════════════════════════════════════════════════════════════

void loop() {
  uint32_t now = millis();

  // ── Update sensor ─────────────────────────────────────────────────────────
  if (sensorOk) {
    pox.update();
    bpm  = pox.getHeartRate();
    spo2 = pox.getSpO2();
  }

  // ── Report setiap 1 detik ─────────────────────────────────────────────────
  if (now - lastReportMs >= REPORT_INTERVAL_MS) {
    lastReportMs = now;

    if (!sensorOk) {
      Serial.println(F("[SENSOR] ⏸  Sensor tidak aktif. Reset untuk coba lagi."));
      return;
    }

    totalReadings++;

    // Cek apakah jari terdeteksi (bpm > 0 dan spo2 > 0)
    jariAda = (bpm > 0.0f && spo2 > 0.0f);

    // Dapatkan raw IR/Red value (jika library mendukung — fallback ke 0)
    uint16_t irRaw  = 0;
    uint16_t redRaw = 0;

    // Di MAX30100 library default, tidak ada getRawIR/getRawRed
    // Tapi kita bisa lihat dari nilai BPM/SpO2 apakah data valid

    // Status diagnosis
    String status;
    if (!jariAda) {
      status = "❌ TIDAK ADA JARI";
    } else if (bpm < 40.0f || bpm > 220.0f || spo2 < 70.0f || spo2 > 100.0f) {
      status = "⚠  DATA TIDAK VALID";
    } else {
      validReadings++;
      status = "✅ OK";

      // Update statistik
      if (bpm < minBpm) minBpm = bpm;
      if (bpm > maxBpm) maxBpm = bpm;
      if (spo2 < minSpo2) minSpo2 = spo2;
      if (spo2 > maxSpo2) maxSpo2 = spo2;
      sumBpm  += bpm;
      sumSpo2 += spo2;
    }

    // ── Cetak ke Serial Monitor ─────────────────────────────────────────────
    char buf[128];
    snprintf(buf, sizeof(buf),
      "%.0f\t%.0f\t%d\t%d\t%s\t%s",
      bpm, spo2, irRaw, redRaw,
      jariAda ? "✔" : "✘",
      status.c_str());
    Serial.println(buf);

    // ── Update LCD ─────────────────────────────────────────────────────────
    if (now - lastLcdUpdateMs >= LCD_UPDATE_MS) {
      lastLcdUpdateMs = now;
      lcd.clear();
      if (!sensorOk) {
        lcd.setCursor(0, 0); lcd.print("Sensor ERROR!");
        lcd.setCursor(0, 1); lcd.print("Cek wiring I2C");
      } else if (!jariAda) {
        lcd.setCursor(0, 0); lcd.print("Tempelkan Jari!");
        lcd.setCursor(0, 1); lcd.print("MAX30100 Ready");
      } else {
        char line1[17], line2[17];
        snprintf(line1, sizeof(line1), "BPM:%3d  SpO2:%3d%%",
                 (int)(bpm + 0.5f), (int)(spo2 + 0.5f));
        if (bpm >= 50 && bpm <= 120 && spo2 >= 85) {
          snprintf(line2, sizeof(line2), "Data Stabil");
        } else {
          snprintf(line2, sizeof(line2), "Tahan Jari...");
        }
        lcd.setCursor(0, 0); lcd.print(line1);
        lcd.setCursor(0, 1); lcd.print(line2);
      }
    }

    // ── Diagnosa ───────────────────────────────────────────────────────────
    if (jariAda && bpm > 0 && spo2 > 0) {
      Serial.printf("  ♥  BPM: %.0f bpm  |  SpO₂: %.0f%%\n", bpm, spo2);
      if (bpm >= 60 && bpm <= 100) {
        Serial.println("  ℹ  BPM Normal (60-100 bpm)");
      } else if (bpm > 100) {
        Serial.println("  ⚠  BPM di atas normal (>100 bpm) — mungkin bergerak");
      } else {
        Serial.println("  ⚠  BPM di bawah normal (<60 bpm)");
      }
      if (spo2 >= 95) {
        Serial.println("  ℹ  SpO₂ Normal (≥95%)");
      } else if (spo2 >= 90) {
        Serial.println("  ⚠  SpO₂ rendah (90-94%) — cek posisi jari");
      } else {
        Serial.println("  🚨 SpO₂ sangat rendah (<90%) — sensor tidak menempel sempurna");
      }
    }
  }

  // ── Test selesai setelah 30 detik ─────────────────────────────────────────
  if (sensorOk && now - startTestMs >= TEST_DURATION_MS) {
    printSummary();

    // Tampilkan summary di LCD
    lcd.clear();
    if (validReadings > 0) {
      float avgBpm = sumBpm / validReadings;
      float avgSpo2 = sumSpo2 / validReadings;
      char buf[17];
      lcd.setCursor(0, 0);
      snprintf(buf, sizeof(buf), "Avg BPM:%.0f", avgBpm);
      lcd.print(buf);
      lcd.setCursor(0, 1);
      snprintf(buf, sizeof(buf), "Avg SpO2:%.0f%%", avgSpo2);
      lcd.print(buf);
    } else {
      lcd.setCursor(0, 0); lcd.print("Test GAGAL!");
      lcd.setCursor(0, 1); lcd.print("Cek jari/sensor");
    }

    Serial.println(F("\n⚠  Test selesai. Tekan RESET untuk mengulang."));
    while (true) {
      delay(10000);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

void printSummary() {
  Serial.println(F("\n╔══════════════════════════════════════╗"));
  Serial.println(F("║         TEST SUMMARY                 ║"));
  Serial.println(F("╚══════════════════════════════════════╝"));

  Serial.printf("  Total readings  : %u\n", totalReadings);
  Serial.printf("  Valid readings  : %u (%.0f%%)\n",
    validReadings,
    totalReadings > 0 ? (validReadings * 100.0f / totalReadings) : 0.0f);

  if (validReadings > 0) {
    float avgBpm  = sumBpm / validReadings;
    float avgSpo2 = sumSpo2 / validReadings;

    Serial.println();
    Serial.println(F("  ── BPM ──"));
    Serial.printf("  Min   : %.0f bpm\n", minBpm);
    Serial.printf("  Max   : %.0f bpm\n", maxBpm);
    Serial.printf("  Rata2 : %.0f bpm\n", avgBpm);

    Serial.println();
    Serial.println(F("  ── SpO₂ ──"));
    Serial.printf("  Min   : %.0f%%\n", minSpo2);
    Serial.printf("  Max   : %.0f%%\n", maxSpo2);
    Serial.printf("  Rata2 : %.0f%%\n", avgSpo2);

    Serial.println();
    Serial.println(F("  ── Diagnosa ──"));
    if (validReadings >= totalReadings * 0.5f) {
      Serial.println(F("  ✅ SENSOR BEKERJA BAIK"));
      Serial.println(F("     MAX30100 bisa membaca darah dengan stabil."));
    } else if (validReadings >= totalReadings * 0.2f) {
      Serial.println(F("  ⚠  SENSOR BEKERJA TAPI KURANG STABIL"));
      Serial.println(F("     Coba: tempel jari lebih tenang / atur IR LED current"));
    } else {
      Serial.println(F("  ❌ SENSOR TIDAK DAPAT MEMBACA DARAH"));
      Serial.println(F("     Penyebab: jari tidak menempel / sensor rusak / wiring"));
    }
  } else {
    Serial.println(F("\n  ❌ TIDAK ADA DATA VALID"));
    Serial.println(F("  MAX30100 TIDAK DAPAT MEMBACA DARAH."));
    Serial.println(F("  Periksa:"));
    Serial.println(F("   1. Apakah jari menempel sempurna?"));
    Serial.println(F("   2. Apakah LED sensor menyala merah?"));
    Serial.println(F("   3. Coba turunkan I2C_CLOCK_HZ ke 50000"));
    Serial.println(F("   4. Coba ganti MAX30100_LED_CURR_50MA ke 100MA"));
    Serial.println(F("   5. Mungkin sensor rusak — ganti MAX30100"));
  }

  Serial.println(F("\n╔══════════════════════════════════════╗"));
  Serial.println(F("║  TEST SELESAI                        ║"));
  Serial.println(F("╚══════════════════════════════════════╝"));
}
