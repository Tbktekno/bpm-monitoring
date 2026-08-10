// =============================================================================
// Simulator Data Sensor ESP8266 (MAX30100)
// =============================================================================
// Meniru pengiriman data dari perangkat ESP32/ESP8266 ke backend:
//   POST /api/v1/readings/device
//   Headers: x-device-id, x-api-key, Content-Type: application/json
//   Body   : { "bpm": <acak>, "spo2": <80–89> }
//
// Loop TIDAK berhenti (unlimited) — mengirim data setiap 0.5 detik
// (bisa diatur lewat INTERVAL_MS). Hentikan dengan Ctrl+C.
//
// Supaya reading ter-link ke responden, mulai dulu sesi monitoring untuk
// device ini di halaman Monitoring (Mulai Monitoring → device aktif).
//
// Cara pakai:
//   node simulate-device.mjs
//
// Env opsional:
//   BACKEND_URL  = http://localhost:5000  (default)
//   DEVICE_ID    = ESP8266-ALPHA-001      (harus terdaftar & aktif di DB)
//   API_KEY      = bpm-sample-alpha-key-001
//   INTERVAL_MS  = 500                    (jeda antar kirim)
//   BPM_MIN      = 55
//   BPM_MAX      = 125
//   SPO2_MIN     = 80                     (default sesuai permintaan: 80–89)
//   SPO2_MAX     = 89
// =============================================================================

import * as http from 'http';
import * as url from 'url';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const DEVICE_ID   = process.env.DEVICE_ID   || 'ESP8266-ALPHA-001';
const API_KEY     = process.env.API_KEY     || 'bpm-sample-alpha-key-001';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS ?? '500', 10);
const BPM_MIN     = parseInt(process.env.BPM_MIN ?? '55', 10);
const BPM_MAX     = parseInt(process.env.BPM_MAX ?? '125', 10);
const SPO2_MIN    = parseInt(process.env.SPO2_MIN ?? '80', 10);
const SPO2_MAX    = parseInt(process.env.SPO2_MAX ?? '89', 10);

const ENDPOINT = new url.URL('/api/v1/readings/device', BACKEND_URL);

let sent = 0;
let failed = 0;
let lastStatus = 200;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sendReading() {
  const bpm = randInt(BPM_MIN, BPM_MAX);
  const spo2 = randInt(SPO2_MIN, SPO2_MAX);
  const body = JSON.stringify({ bpm, spo2 });

  const req = http.request(
    ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-device-id': DEVICE_ID,
        'x-api-key': API_KEY,
      },
    },
    (res) => {
      res.resume();
      lastStatus = res.statusCode || 0;
      if (res.statusCode === 201) {
        sent++;
      } else {
        failed++;
        console.log(`  ❌ HTTP ${res.statusCode} | bpm=${bpm} spo2=${spo2}%`);
      }
      process.stdout.write(
        `\r  [${new Date().toLocaleTimeString()}] bpm=${bpm} spo2=${spo2}%  OK=${sent}  GAGAL=${failed}  (HTTP ${lastStatus})`
      );
    }
  );

  req.setTimeout(3000, () => req.destroy(new Error('Request timeout')));
  req.on('error', (err) => {
    failed++;
    lastStatus = 0;
    process.stdout.write(`\r  [${new Date().toLocaleTimeString()}] GAGAL kirim: ${err.code || err.message}  OK=${sent}  GAGAL=${failed}          `);
  });

  req.write(body);
  req.end();
}

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║        Simulator Sensor — BPM & SpO₂ Monitoring          ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  Endpoint : ${ENDPOINT.href}`);
console.log(`  Device   : ${DEVICE_ID}  (API key: ${API_KEY.slice(0, 8)}...)`);
console.log(`  Interval : ${INTERVAL_MS} ms (unlimited loop)`);
console.log(`  BPM      : acak ${BPM_MIN}–${BPM_MAX}`);
console.log(`  SpO₂     : acak ${SPO2_MIN}–${SPO2_MAX}%`);
console.log('');
console.log('  ⚠ Aktifkan dulu sesi monitoring di frontend (Mulai Monitoring)');
console.log('    agar data otomatis tercatat ke responden.');
console.log('  ▶ Kirim dimulai. Tekan Ctrl+C untuk berhenti.');
console.log('');

sendReading();
setInterval(sendReading, INTERVAL_MS);

process.on('SIGINT', () => {
  console.log('\n\n⏹ Simulator dihentikan.');
  console.log(`   Total OK=${sent}  GAGAL=${failed}`);
  process.exit(0);
});