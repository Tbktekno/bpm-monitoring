/**
 * RFID Scanner Firmware for ESP8266 (MASTER/WIFI MODE)
 * Hardware: ESP8266 + MFRC522 + LCD I2C
 * 
 * Komunikasi: Menggunakan HTTP WiFi untuk menunggu hasil dari Backend,
 *             dan Serial untuk men-trigger ESP32-CAM.
 * 
 * Pinout:
 * MFRC522 | ESP8266 (D-Series labels) | GPIO
 * ------------------------------------------
 * RST     | D4                        | 2
 * SDA(SS) | D8                        | 15
 * MOSI    | D7                        | 13
 * MISO    | D6                        | 12
 * SCK     | D5                        | 14
 * 
 * LCD I2C | ESP8266
 * -----------------
 * SDA     | D2 (GPIO 4)
 * SCL     | D1 (GPIO 5)
 */

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// ================= CONFIG WIFI & BACKEND =================
const char* ssid = "Ikannn";
const char* password = "11122233344556";
const char* serverUrl = "http://10.16.199.114:3000";

const char* deviceCode = "ESP8266-MASTER-01";
const char* pairingKey = "ROOM-1";

#define SS_PIN  15
#define RST_PIN 2
#define BUZZER_PIN 0   // D3 (GPIO0)
#define RX_PIN 3       // Pin RX bawaan (GPIO3)

MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Pin 16 (D0) digunakan sebagai TX. Pin 3 (RX) digunakan sebagai RX.
SoftwareSerial linkSerial(RX_PIN, 16); 

unsigned long lastScanAt = 0;
const unsigned long scanCooldownMs = 3000;

void connectWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    lcd.print("WiFi Connected!");
  } else {
    Serial.println("\nWiFi Failed!");
    lcd.print("WiFi Failed!");
  }
  delay(1000);
}

void beep(int durationMs = 100) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER_PIN, LOW);
}

void showIdle() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Ready to Scan");
  lcd.setCursor(0, 1);
  lcd.print("Tempel Kartu...");
}

String readUID() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    uid += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void setup() {
  Serial.begin(115200, SERIAL_8N1, SERIAL_TX_ONLY);   // Debug port
  linkSerial.begin(9600); // Komunikasi ke ESP32-CAM

  Wire.begin(4, 5);
  lcd.init();
  lcd.backlight();
  
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  connectWiFi();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("RFID Initializing");
  
  SPI.begin();
  mfrc522.PCD_Init();
  
  delay(1000);
  showIdle();
}

void loop() {
  if (millis() - lastScanAt < scanCooldownMs) return;

  // Cek koneksi WiFi
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    showIdle();
  }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) return;

  String uid = readUID();

  // Beep deteksi awal
  beep(100);
  
  Serial.println("UID Detected: " + uid);
  lastScanAt = millis();

  // Tampilkan di LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Memproses...");
  lcd.setCursor(0, 1);
  lcd.print("Tunggu sebentar.");

  // Kirim ke API Gateway untuk Cek RFID dulu
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    // STEP 1: Cek apakah RFID terdaftar
    http.begin(client, String(serverUrl) + "/api/v1/attendance/check-rfid");
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000); // Timeout cepat untuk check

    String payload = "{\"uid\":\"" + uid + "\",\"deviceCode\":\"" + String(deviceCode) + "\",\"pairingKey\":\"" + String(pairingKey) + "\"}";
    Serial.println("Checking RFID: " + payload);
    
    int checkCode = http.POST(payload);
    Serial.printf("Check Response Code: %d\n", checkCode);

    if (checkCode == 200) {
      String responseBody = http.getString();
      Serial.println(responseBody);
      
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, responseBody);
      
      if (!error && doc["registered"] == false) {
        // STEP 3A: RFID TIDAK TERDAFTAR
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("RFID TIDAK");
        lcd.setCursor(0, 1);
        lcd.print("TERDAFTAR");
        Serial.println("RFID belum terdaftar, membatalkan capture.");
        beep(100); delay(100); beep(100); // Beep error
        http.end();
        
        delay(3000);
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
        showIdle();
        return; // Berhenti di sini, tidak men-trigger kamera
      }
    } else {
      // Gagal menghubungi server saat check
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Koneksi Error");
      beep(100); delay(50); beep(100);
      http.end();
      
      delay(3000);
      mfrc522.PICC_HaltA();
      mfrc522.PCD_StopCrypto1();
      showIdle();
      return;
    }
    http.end();

    // STEP 3B: RFID TERDAFTAR
    // Tampilkan pesan dan kirim perintah ke ESP32-CAM
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Mengambil Foto..");
    
    String cmd = "CAPTURE|" + uid;
    linkSerial.println(cmd);
    Serial.println("Triggering ESP32-CAM: " + cmd);

    // STEP 4: Tunggu hasil verifikasi wajah
    http.begin(client, String(serverUrl) + "/api/v1/attendance/rfid");
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(25000); // Timeout lama karena menunggu AI Face Recognition
    
    Serial.println("Waiting for Face Verification...");
    int verifyCode = http.POST(payload);
    Serial.printf("Verify Response Code: %d\n", verifyCode);

    lcd.clear();
    if (verifyCode == 200) {
      lcd.setCursor(0, 0);
      lcd.print("Wajah Cocok!    ");
      lcd.setCursor(0, 1);
      lcd.print("Verified        ");
      Serial.println("Verifikasi Wajah Berhasil");
      beep(500); // Beep sukses (panjang)
    } else if (verifyCode == 400 || verifyCode == 401) { 
      lcd.setCursor(0, 0);
      lcd.print("Wajah Tdk Cocok ");
      lcd.setCursor(0, 1);
      lcd.print("Verifikasi Gagal");
      Serial.println("Verifikasi Wajah Gagal");
      beep(100); delay(50); beep(100); delay(50); beep(100);
    } else {
      lcd.setCursor(0, 0);
      lcd.print("Koneksi Timeout ");
      lcd.setCursor(0, 1);
      lcd.print("Coba Lagi       ");
      Serial.println("Timeout atau Server Error");
      beep(100); delay(50); beep(100); delay(50); beep(100);
    }
    http.end();
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Terputus");
    beep(100); delay(50); beep(100); delay(50); beep(100);
  }
  
  delay(3000); // Tahan tampilan hasil selama 3 detik
  
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  showIdle();
}
