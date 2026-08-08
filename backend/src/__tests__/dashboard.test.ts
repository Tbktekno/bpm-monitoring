// =============================================================================
// Dashboard API — Integration Tests
// =============================================================================
// Tests the dashboard controller's aggregated stats endpoint with mocked
// Prisma database layer.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ─── Mock Prisma (use vi.hoisted to avoid hoisting issues) ────────────────────
const mockPrisma = vi.hoisted(() => ({
  patient: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  reading: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('../server/middleware/request-logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Import controller after mocks ────────────────────────────────────────────
import { getDashboard } from '../modules/dashboard/dashboard.controller';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    params: {},
    body: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' } as any,
    admin: { id: 1, email: 'admin@test.com', name: 'Admin' },
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

// ─── Test Data ────────────────────────────────────────────────────────────────
const mockRecentReadings = [
  { bpm: 75, spo2: 98 },
  { bpm: 82, spo2: 95 },
  { bpm: 110, spo2: 92 },
  { bpm: 65, spo2: 97 },
];

const mockLast10 = [
  {
    bpm: 75,
    spo2: 98,
    status: 'NORMAL',
    createdAt: new Date(),
    patient: { id: 1, patientId: 'P-001', name: 'Patient A' },
  },
  {
    bpm: 110,
    spo2: 92,
    status: 'WASPADA',
    createdAt: new Date(),
    patient: { id: 2, patientId: 'P-002', name: 'Patient B' },
  },
];

// =============================================================================
// Tests
// =============================================================================
describe('getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct dashboard stats format', async () => {
    mockPrisma.patient.count.mockResolvedValue(5);
    mockPrisma.reading.groupBy.mockResolvedValue([
      { patientId: 1, _max: { id: 10 } },
      { patientId: 2, _max: { id: 20 } },
      { patientId: 3, _max: { id: 30 } },
      { patientId: 4, _max: { id: 40 } },
    ]);
    // Default: any unmatched findMany returns []; then queue specific returns
    mockPrisma.reading.findMany
      // ── 1. latest statuses ──
      .mockResolvedValueOnce([
        { status: 'NORMAL' },
        { status: 'WASPADA' },
        { status: 'DARURAT' },
        { status: 'NORMAL' },
      ])
      // ── 2. computeAverages(24h) — returns data → no fallback ──
      .mockResolvedValueOnce(mockRecentReadings)
      // ── 3. last 10 readings ──
      .mockResolvedValueOnce(mockLast10)
      // ── 4. today's chart data ──
      .mockResolvedValueOnce([]);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await getDashboard(req, res, next);

    expect(res.json).toHaveBeenCalledTimes(1);
    const callArg = (res.json as any).mock.calls[0][0];

    // Top-level response shape
    expect(callArg).toHaveProperty('success', true);
    expect(callArg).toHaveProperty('data');
    expect(callArg).toHaveProperty('message', 'Dashboard data retrieved');

    const data = callArg.data;

    // Total patients
    expect(data).toHaveProperty('totalPatients', 5);

    // Status distribution (now includes tanpaData)
    expect(data).toHaveProperty('statusDistribution');
    expect(data.statusDistribution).toMatchObject({
      normal: 2,
      perluPemeriksaan: 2,
    });
    expect(data.statusDistribution).toHaveProperty('tanpaData');
    // totalPatients 5 - (2+2) = 1
    expect(data.statusDistribution.tanpaData).toBe(1);

    // Averages (new shape: totalReadings + range instead of totalReadings24h)
    expect(data).toHaveProperty('averages');
    expect(data.averages).toHaveProperty('avgBpm');
    expect(data.averages).toHaveProperty('avgSpo2');
    expect(data.averages).toHaveProperty('totalReadings');
    expect(data.averages).toHaveProperty('range');
    // avgBpm = (75+82+110+65)/4 = 83, avgSpo2 = (98+95+92+97)/4 = 95.5 → 96
    expect(data.averages.avgBpm).toBe(83);
    expect(data.averages.avgSpo2).toBe(96);
    expect(data.averages.totalReadings).toBe(4);
    expect(data.averages.range).toBe('24h');

    // Last 10 readings
    expect(data).toHaveProperty('last10Readings');
    expect(data.last10Readings).toHaveLength(2);

    // Chart data
    expect(data).toHaveProperty('chartData');
    expect(Array.isArray(data.chartData)).toBe(true);

    // Timestamp
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.timestamp).toBe('string');
  });

  it('returns zeros when there are no patients', async () => {
    mockPrisma.patient.count.mockResolvedValue(0);
    mockPrisma.reading.groupBy.mockResolvedValue([]);
    // Default: every findMany returns []
    mockPrisma.reading.findMany.mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await getDashboard(req, res, next);

    const callArg = (res.json as any).mock.calls[0][0].data;

    expect(callArg.totalPatients).toBe(0);
    expect(callArg.statusDistribution).toMatchObject({
      normal: 0,
      perluPemeriksaan: 0,
    });
    expect(callArg.statusDistribution).toHaveProperty('tanpaData', 0);
    expect(callArg.averages.avgBpm).toBe(0);
    expect(callArg.averages.avgSpo2).toBe(0);
    expect(callArg.averages.totalReadings).toBe(0);
    expect(callArg.averages.range).toBe('none');
    expect(callArg.last10Readings).toHaveLength(0);
  });

  it('aggregates chart data by hour', async () => {
    const now = new Date();
    // Create dates with specific hours
    const date1 = new Date(now);
    date1.setHours(8, 15, 0, 0);
    const date2 = new Date(now);
    date2.setHours(8, 45, 0, 0);
    const date3 = new Date(now);
    date3.setHours(9, 5, 0, 0);

    const todayReadings = [
      { bpm: 70, spo2: 98, status: 'NORMAL', createdAt: date1 },
      { bpm: 72, spo2: 97, status: 'NORMAL', createdAt: date2 },
      { bpm: 80, spo2: 96, status: 'NORMAL', createdAt: date3 },
    ];

    mockPrisma.patient.count.mockResolvedValue(1);
    mockPrisma.reading.groupBy.mockResolvedValue([
      { patientId: 1, _max: { id: 5 } },
    ]);
    // Set default so unmatched findMany calls return []
    mockPrisma.reading.findMany
      // ── 1. latest statuses ──
      .mockResolvedValueOnce([{ status: 'NORMAL' }])
      // ── 2. computeAverages(24h) — returns [] → triggers 7d fallback ──
      .mockResolvedValueOnce([])
      // ── 3. computeAverages(168h / 7d) — returns [] → triggers all-time ──
      .mockResolvedValueOnce([])
      // ── 4. all-time fallback — also returns [] → avgBpm=0, avgSpo2=0 ──
      .mockResolvedValueOnce([])
      // ── 5. last 10 readings ──
      .mockResolvedValueOnce([])
      // ── 6. today's chart data ──
      .mockResolvedValueOnce(todayReadings);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await getDashboard(req, res, next);

    const callArg = (res.json as any).mock.calls[0][0].data;

    expect(callArg.chartData).toHaveLength(2); // 2 hours with data
    // First bucket: 08:00
    expect(callArg.chartData[0]).toHaveProperty('hour', '08:00');
    expect(callArg.chartData[0]).toHaveProperty('avgBpm');
    expect(callArg.chartData[0]).toHaveProperty('avgSpo2');
    expect(callArg.chartData[0]).toHaveProperty('readingCount', 2);
  });

  it('calls next with error on failure', async () => {
    const error = new Error('Database error');
    mockPrisma.patient.count.mockRejectedValue(error);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await getDashboard(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
