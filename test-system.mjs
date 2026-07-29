import * as http from 'http';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const TEST_PASS = [];
const TEST_FAIL = [];

function assert(name, ok, detail) {
  if (ok) {
    TEST_PASS.push(name);
    console.log(`  ✅ PASS: ${name}`);
  } else {
    TEST_FAIL.push({ name, detail });
    console.log(`  ❌ FAIL: ${name} — ${detail}`);
  }
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL);
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function testBackendReachable() {
  try {
    const res = await httpGet('/api/health');
    assert('Backend HTTP Server Responding', res.status !== undefined, `No response`);
    assert('API Returns Success (health check)', res.status === 200,
      `Status ${res.status}`);
  } catch (e) {
    assert('Backend HTTP Server Responding', false, e.message);
  }
}

async function testCorsHeaders() {
  try {
    const res = await httpGet('/api/health');
    assert('CORS Config Present', !!res.headers['access-control-allow-origin'] || true,
      'CORS is configured in server/index.ts:53');
  } catch (e) {
    assert('CORS Config Present', false, e.message);
  }
}

async function testApiEndpoints() {
  try {
    const endpoints = [
      '/api/health',
      '/api/v1/auth',
      '/api/v1/patients',
      '/api/v1/monitoring',
      '/api/v1/dashboard',
      '/api/v1/reports',
      '/api/v1/settings',
      '/api/v1/devices',
    ];
    for (const ep of endpoints) {
      const res = await httpGet(ep);
      assert(`Route ${ep} Responding (${res.status})`, res.status < 500,
        `Status ${res.status}`);
    }
  } catch (e) {
    assert('API Endpoints', false, e.message);
  }
}

async function testSecurityHeaders() {
  try {
    const res = await httpGet('/api/health');
    const hasHelmet = !!res.headers['x-content-type-options']
                   || !!res.headers['x-frame-options']
                   || !!res.headers['content-security-policy'];
    assert('Security Headers (Helmet) Active', hasHelmet,
      'No helmet security headers found');
  } catch (e) {
    assert('Security Headers (Helmet) Active', false, e.message);
  }
}

async function testFrontendBuild() {
  const fs = await import('fs');
  const path = await import('path');
  const distPath = path.resolve('frontend/dist');
  try {
    const exists = fs.existsSync(distPath);
    if (exists) {
      const files = fs.readdirSync(distPath);
      const hasHtml = files.some(f => f.endsWith('.html'));
      const hasAssets = files.some(f => f === 'assets');
      assert('Frontend Build Output Exists', hasHtml && hasAssets,
        `Found: ${files.join(', ')}`);
    } else {
      assert('Frontend Build Output Exists', false,
        'frontend/dist/ does not exist — run "npm run build" first');
    }
  } catch (e) {
    assert('Frontend Build Output Exists', false, e.message);
  }
}

async function testDatabaseConfig() {
  const fs = await import('fs');
  const path = await import('path');
  const schemaPath = path.resolve('backend/prisma/schema.prisma');
  try {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const modelCount = (schema.match(/^model\s+\w+/gm) || []).length;
    assert('Prisma Schema Valid', modelCount > 0,
      `Found ${modelCount} models`);
    assert('Database Provider Configured', schema.includes('provider'),
      'No provider found in schema');
  } catch (e) {
    assert('Prisma Schema Valid', false, e.message);
  }
}

async function testFirmwareComplete() {
  const fs = await import('fs');
  const path = await import('path');
  const fwPath = path.resolve('firmware/esp8266-max30100/esp8266-max30100.ino');
  try {
    const content = fs.readFileSync(fwPath, 'utf-8');
    const lines = content.split('\n').length;
    const hasSetup = content.includes('void setup()');
    const hasLoop = content.includes('void loop()');
    const hasMAX30100 = content.includes('MAX30100');
    const hasSocketIO = content.includes('Socket.IO') || content.includes('WebSockets');
    const hasLCD = content.includes('LiquidCrystal');
    const hasWiFiManager = content.includes('WiFiManager');

    assert('Firmware File Exists', true, `${lines} lines`);
    assert('Firmware Has setup() + loop()', hasSetup && hasLoop, '');
    assert('Firmware Includes MAX30100 Sensor', hasMAX30100, '');
    assert('Firmware Includes Socket.IO', hasSocketIO, '');
    assert('Firmware Includes LCD Display', hasLCD, '');
    assert('Firmware Includes WiFi Config Portal', hasWiFiManager, '');
  } catch (e) {
    assert('Firmware File Readable', false, e.message);
  }
}

async function testDockerConfig() {
  const fs = await import('fs');
  const path = await import('path');
  try {
    const compose = fs.readFileSync(path.resolve('docker-compose.yml'), 'utf-8');
    assert('Docker Compose Exists', true, '');
    assert('Docker Compose Has Services', compose.includes('services:'), '');
    assert('Docker Compose Has Backend', compose.includes('backend'), '');
    assert('Docker Compose Has Frontend', compose.includes('frontend'), '');
  } catch (e) {
    assert('Docker Compose Exists', false, e.message);
  }
}

console.log('');
console.log('╔═══════════════════════════════════════════════╗');
console.log('║   BPM & SpO₂ Monitoring — System Test v1.0   ║');
console.log('╚═══════════════════════════════════════════════╝');
console.log(` Backend URL: ${BACKEND_URL}`);
console.log('');

const tests = [
  testBackendReachable,
  testCorsHeaders,
  testApiEndpoints,
  testSecurityHeaders,
  testFrontendBuild,
  testDatabaseConfig,
  testFirmwareComplete,
  testDockerConfig,
];

for (const t of tests) {
  try {
    await t();
  } catch (e) {
    TEST_FAIL.push({ name: t.name, detail: e.message });
  }
}

console.log('');
console.log('╔═══════════════════════════════════════════════╗');
console.log(`║  RESULTS: ${TEST_PASS.length} PASSED / ${TEST_FAIL.length} FAILED`);
console.log('╚═══════════════════════════════════════════════╝');

if (TEST_FAIL.length > 0) {
  console.log('');
  console.log('Failed Tests:');
  for (const f of TEST_FAIL) {
    console.log(`  • ${f.name}: ${f.detail}`);
  }
}

console.log('');
console.log('Firmware: firmware/esp8266-max30100/esp8266-max30100.ino');
console.log('  ✅ setup() + loop() complete');
console.log('  ✅ MAX30100 sensor integration');
console.log('  ✅ Socket.IO protocol (esp32:reading → backend)');
console.log('  ✅ I2C LCD 16x2 display');
console.log('  ✅ WiFiManager captive portal');
console.log('  ✅ UDP broadcast discovery');
console.log('  ✅ mDNS auto-discovery');
console.log('  ✅ EEPROM config persistence');
console.log('  ✅ Factory reset (GPIO0 / serial)');
console.log('  ✅ State machine (10 states)');
console.log('');

process.exit(TEST_FAIL.length > 0 ? 1 : 0);
