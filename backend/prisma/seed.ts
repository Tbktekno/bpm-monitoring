// =============================================================================
// Database Seed — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Run with: npx prisma db push && npx prisma db seed
// Or:       ts-node prisma/seed.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calculateBpmStatus(bpm: number): string {
  if (bpm < 60) return 'BRADICARDIA';
  if (bpm <= 100) return 'NORMAL';
  if (bpm <= 120) return 'TACHY_RINGAN';
  return 'TACHY_BERAT';
}

function calculateSpo2Status(spo2: number): string {
  if (spo2 >= 95) return 'NORMAL';
  if (spo2 >= 90) return 'HIPOKSEMIA_RINGAN';
  if (spo2 >= 85) return 'HIPOKSEMIA_SEDANG';
  return 'HIPOKSEMIA_BERAT';
}

function calculateCompositeStatus(bpmStatus: string, spo2Status: string): string {
  if (bpmStatus === 'NORMAL' && spo2Status === 'NORMAL') return 'NORMAL';
  if (
    bpmStatus === 'BRADICARDIA' ||
    bpmStatus === 'TACHY_BERAT' ||
    spo2Status === 'HIPOKSEMIA_SEDANG' ||
    spo2Status === 'HIPOKSEMIA_BERAT'
  ) {
    return 'DARURAT';
  }
  return 'WASPADA';
}

function computeAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ─── Main seed function ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱 Seeding database …\n');

  // ─── 1. Clear existing data (order respects FK constraints) ──────────────
  await prisma.auditLog.deleteMany();
  await prisma.reading.deleteMany();
  await prisma.monitoringSession.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.esp32Device.deleteMany();

  // ─── 2. Admin user ────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.admin.create({
    data: {
      name: 'Admin Dashboard',
      email: 'admin@monitoring-bpm.web.id',
      passwordHash,
    },
  });
  console.log(`  ✓ Admin created: ${admin.email}`);

  // ─── 3. Default settings ──────────────────────────────────────────────────
  const settingsData = [
    { key: 'min_bpm', value: '60', description: 'Batas bawah BPM normal' },
    { key: 'max_bpm', value: '100', description: 'Batas atas BPM normal' },
    { key: 'min_spo2', value: '95', description: 'Batas bawah SpO₂ normal' },
    { key: 'max_spo2', value: '100', description: 'Batas atas SpO₂ normal' },
  ];

  for (const s of settingsData) {
    await prisma.setting.create({ data: s });
  }
  console.log(`  ✓ ${settingsData.length} settings created`);

  // ─── 4. Sample patients ───────────────────────────────────────────────────
  const patientsData = [
    {
      patientId: 'P-001',
      name: 'Budi Santoso',
      nik: '3174011508800001',
      gender: 'L',
      birthDate: new Date('1980-08-15'),
      address: 'Jl. Merdeka No. 10, Jakarta Pusat',
      phone: '081234567890',
      bloodType: 'O',
      height: 170,
      weight: 75,
      medicalHistory: 'Hipertensi stage 1, DM tipe 2',
      doctorNote: 'Kontrol rutin tekanan darah dan gula darah',
    },
    {
      patientId: 'P-002',
      name: 'Siti Rahmawati',
      nik: '3201256712900002',
      gender: 'P',
      birthDate: new Date('1990-12-27'),
      address: 'Jl. Braga No. 25, Bandung',
      phone: '081298765432',
      bloodType: 'A',
      height: 158,
      weight: 55,
      medicalHistory: 'Asma bronkial, alergi obat NSAID',
      doctorNote: 'Hindari pemicu asma, sediakan inhaler',
    },
    {
      patientId: 'P-003',
      name: 'Ahmad Hidayat',
      nik: '3173020506600003',
      gender: 'L',
      birthDate: new Date('1960-06-05'),
      address: 'Jl. Diponegoro No. 88, Surabaya',
      phone: '081255566677',
      bloodType: 'B',
      height: 165,
      weight: 80,
      medicalHistory: 'PJK, hiperkolesterolemia, post-MI 2019',
      doctorNote: 'Ekokardiografi rutin, pantau lipid profile',
    },
    {
      patientId: 'P-004',
      name: 'Dewi Sartika',
      nik: '3273111503950004',
      gender: 'P',
      birthDate: new Date('1995-03-15'),
      address: 'Jl. Malioboro No. 45, Yogyakarta',
      phone: '081377788899',
      bloodType: 'AB',
      height: 162,
      weight: 52,
      medicalHistory: 'Anemia defisiensi besi, hipotensi ortostatik',
      doctorNote: 'Suplemen Fe, monitoring Hb rutin',
    },
    {
      patientId: 'P-005',
      name: 'Eko Prasetyo',
      nik: '3519082210750005',
      gender: 'L',
      birthDate: new Date('1975-10-22'),
      address: 'Jl. Sumatra No. 33, Medan',
      phone: '081466655544',
      bloodType: 'O',
      height: 172,
      weight: 70,
      medicalHistory: 'Sehat, riwayat keluarga hipertensi',
      doctorNote: 'Medical check-up tahunan',
    },
    {
      patientId: 'P-006',
      name: 'Reka',
      nik: '1234567890123456',
      gender: 'P',
      birthDate: new Date('1998-07-08'),
      address: 'Jl. Merpati No. 7, Yogyakarta',
      phone: '087765432109',
      bloodType: 'B',
      height: 168,
      weight: 65,
      medicalHistory: '-',
      doctorNote: '-',
    },
  ];

  const patients = [];
  for (const p of patientsData) {
    const patient = await prisma.patient.create({
      data: {
        ...p,
        age: computeAge(p.birthDate),
      },
    });
    patients.push(patient);
  }
  console.log(`  ✓ ${patients.length} patients created`);

  // ─── 5. Monitoring sessions + sample readings ─────────────────────────────
  const now = new Date();

  // ── Patient P-001: Hipertensi — BP tendency high, SpO₂ normal ─────────────
  const session1 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[0].id,
      status: 'ACTIVE',
      startTime: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      notes: 'Pasien dalam observasi tekanan darah',
    },
  });

  const readingsP1 = [
    { bpm: 85, spo2: 98 },
    { bpm: 88, spo2: 97 },
    { bpm: 92, spo2: 97 },
    { bpm: 95, spo2: 96 },
    { bpm: 98, spo2: 96 },
    { bpm: 102, spo2: 95 },
    { bpm: 105, spo2: 95 },
    { bpm: 108, spo2: 94 },
    { bpm: 95, spo2: 96 },
    { bpm: 90, spo2: 97 },
  ];

  for (let i = 0; i < readingsP1.length; i++) {
    const r = readingsP1[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[0].id,
        sessionId: session1.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (60 - i * 6) * 60 * 1000),
      },
    });
  }

  // ── Patient P-002: Asma — BPM slightly high, SpO₂ varies ──────────────────
  const session2 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[1].id,
      status: 'ACTIVE',
      startTime: new Date(now.getTime() - 45 * 60 * 1000),
      notes: 'Monitoring saturasi oksigen',
    },
  });

  const readingsP2 = [
    { bpm: 75, spo2: 98 },
    { bpm: 78, spo2: 96 },
    { bpm: 82, spo2: 94 },
    { bpm: 80, spo2: 93 },
    { bpm: 85, spo2: 92 },
    { bpm: 88, spo2: 91 },
    { bpm: 90, spo2: 93 },
    { bpm: 84, spo2: 95 },
    { bpm: 79, spo2: 96 },
    { bpm: 76, spo2: 97 },
  ];

  for (let i = 0; i < readingsP2.length; i++) {
    const r = readingsP2[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[1].id,
        sessionId: session2.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (45 - i * 4.5) * 60 * 1000),
      },
    });
  }

  // ── Patient P-003: PJK — BPM tachy, SpO₂ low ⚠️ (DARURAT episodes) ───────
  const session3 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[2].id,
      status: 'ACTIVE',
      startTime: new Date(now.getTime() - 30 * 60 * 1000),
      notes: 'Observasi pasca angina',
    },
  });

  const readingsP3 = [
    { bpm: 110, spo2: 93 },
    { bpm: 115, spo2: 91 },
    { bpm: 122, spo2: 88 },
    { bpm: 130, spo2: 85 },
    { bpm: 125, spo2: 86 },
    { bpm: 118, spo2: 89 },
    { bpm: 112, spo2: 92 },
    { bpm: 108, spo2: 93 },
    { bpm: 105, spo2: 94 },
    { bpm: 100, spo2: 95 },
  ];

  for (let i = 0; i < readingsP3.length; i++) {
    const r = readingsP3[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[2].id,
        sessionId: session3.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (30 - i * 3) * 60 * 1000),
      },
    });
  }

  // ── Patient P-004: Anemia — BPM fast, SpO₂ normal-ish ─────────────────────
  const session4 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[3].id,
      status: 'COMPLETED',
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // yesterday
      endTime: new Date(now.getTime() - 23 * 60 * 60 * 1000),
      notes: 'Observasi harian selesai',
    },
  });

  const readingsP4 = [
    { bpm: 95, spo2: 97 },
    { bpm: 98, spo2: 96 },
    { bpm: 100, spo2: 96 },
    { bpm: 102, spo2: 95 },
    { bpm: 105, spo2: 95 },
    { bpm: 108, spo2: 94 },
    { bpm: 110, spo2: 94 },
    { bpm: 106, spo2: 95 },
    { bpm: 100, spo2: 96 },
    { bpm: 96, spo2: 97 },
  ];

  for (let i = 0; i < readingsP4.length; i++) {
    const r = readingsP4[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[3].id,
        sessionId: session4.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (24 - i * 0.1) * 60 * 60 * 1000),
      },
    });
  }

  // ── Patient P-005: Sehat — all readings NORMAL ────────────────────────────
  const session5 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[4].id,
      status: 'ACTIVE',
      startTime: new Date(now.getTime() - 15 * 60 * 1000),
      notes: 'Routine check',
    },
  });

  const readingsP5 = [
    { bpm: 72, spo2: 99 },
    { bpm: 74, spo2: 98 },
    { bpm: 71, spo2: 99 },
    { bpm: 73, spo2: 98 },
    { bpm: 76, spo2: 97 },
    { bpm: 75, spo2: 98 },
    { bpm: 74, spo2: 99 },
    { bpm: 72, spo2: 98 },
    { bpm: 73, spo2: 99 },
    { bpm: 75, spo2: 98 },
  ];

  for (let i = 0; i < readingsP5.length; i++) {
    const r = readingsP5[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[4].id,
        sessionId: session5.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (15 - i * 1.5) * 60 * 1000),
      },
    });
  }

  // ── Patient P-006: Reka — BPM bervariasi, SpO₂ cenderung rendah ──────────
  const session6 = await prisma.monitoringSession.create({
    data: {
      patientId: patients[5].id,
      status: 'COMPLETED',
      startTime: new Date(now.getTime() - 10 * 60 * 1000),
      endTime: new Date(now.getTime() - 5 * 60 * 1000),
      notes: 'Observasi saturasi oksigen',
    },
  });

  const readingsP6 = [
    { bpm: 74, spo2: 96 },
    { bpm: 74, spo2: 96 },
    { bpm: 72, spo2: 96 },
    { bpm: 51, spo2: 94 },
    { bpm: 51, spo2: 94 },
    { bpm: 51, spo2: 94 },
    { bpm: 51, spo2: 94 },
    { bpm: 74, spo2: 94 },
    { bpm: 74, spo2: 94 },
    { bpm: 59, spo2: 94 },
    { bpm: 59, spo2: 94 },
  ];

  for (let i = 0; i < readingsP6.length; i++) {
    const r = readingsP6[i];
    const bpmStatus = calculateBpmStatus(r.bpm);
    const spo2Status = calculateSpo2Status(r.spo2);
    const status = calculateCompositeStatus(bpmStatus, spo2Status);
    await prisma.reading.create({
      data: {
        patientId: patients[5].id,
        sessionId: session6.id,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus,
        spo2Status,
        status,
        createdAt: new Date(now.getTime() - (10 - i * 0.45) * 60 * 1000),
      },
    });
  }

  // ── 6. ESP32 devices (sample) ─────────────────────────────────────────────
  // API Key plaintext (untuk config ESP8266):
  //   ESP32-ALPHA-001 → bpm-sample-alpha-key-001
  //   ESP32-BETA-002  → bpm-sample-beta-key-002
  //   ESP32-GAMMA-003 → bpm-sample-gamma-key-003
  //
  // Di database hanya disimpan SHA-256 hash-nya.
  // ⚠ Ganti API key ini dengan key yang digenerate via dashboard untuk production!

  const seedDevice = (deviceId: string, rawKey: string, label: string, isActive: boolean) => {
    const hashed = crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
    return prisma.esp32Device.create({
      data: { deviceId, apiKey: hashed, label, isActive },
    });
  };

  await seedDevice('ESP32-ALPHA-001', 'bpm-sample-alpha-key-001', 'Ruang Observasi 1', true);
  await seedDevice('ESP32-BETA-002',  'bpm-sample-beta-key-002',  'Ruang IGD',          true);
  await seedDevice('ESP32-GAMMA-003', 'bpm-sample-gamma-key-003', 'Ruang Perawatan 2',  false);
  console.log('  ✓ 3 ESP32 devices created');

  console.log('\n✅ Seeding complete!');
  console.log(`   • ${patients.length} patients`);
  console.log(`   • ${readingsP1.length + readingsP2.length + readingsP3.length + readingsP4.length + readingsP5.length + readingsP6.length} readings across ${patients.length} sessions`);
  console.log(`   • ${settingsData.length} settings`);
  console.log(`   • 3 ESP32 devices`);
  console.log(`   • 1 admin user (admin@monitoring-bpm.web.id / Admin123!)`);
}

// ─── Execute ─────────────────────────────────────────────────────────────────
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
