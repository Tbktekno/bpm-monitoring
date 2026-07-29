// =============================================================================
// Patients API — Integration Tests
// =============================================================================
// Tests for the Patients controller CRUD operations with a mocked Prisma
// database layer.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ─── Mock Prisma (use vi.hoisted to avoid hoisting issues) ────────────────────
const mockPrisma = vi.hoisted(() => ({
  patient: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  reading: {
    deleteMany: vi.fn(),
  },
  monitoringSession: {
    deleteMany: vi.fn(),
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
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
} from '../modules/patients/patients.controller';

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
const mockPatient = {
  id: 1,
  patientId: 'P-001',
  name: 'John Doe',
  nik: '3201012000010001',
  gender: 'L',
  birthDate: new Date('1990-01-01'),
  age: 34,
  address: 'Jl. Merdeka No.1',
  phone: '08123456789',
  bloodType: 'O',
  height: 175,
  weight: 70,
  medicalHistory: null,
  doctorNote: null,
  status: 'Normal',
  createdAt: new Date(),
  updatedAt: new Date(),
  readings: [],
  sessions: [],
  _count: { readings: 0 },
};

// =============================================================================
// Tests
// =============================================================================
describe('listPatients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated patient list with default params', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([mockPatient]);
    mockPrisma.patient.count.mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await listPatients(req, res, next);

    expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(mockPrisma.patient.count).toHaveBeenCalledWith({ where: {} });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          items: expect.any(Array),
          pagination: expect.objectContaining({
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
          }),
        }),
      }),
    );
  });

  it('respects page and limit query parameters', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([]);
    mockPrisma.patient.count.mockResolvedValue(0);

    const req = mockReq({ query: { page: '2', limit: '5' } });
    const res = mockRes();
    const next = mockNext();

    await listPatients(req, res, next);

    expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it('caps limit at 100', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([]);
    mockPrisma.patient.count.mockResolvedValue(0);

    const req = mockReq({ query: { limit: '999' } });
    const res = mockRes();
    const next = mockNext();

    await listPatients(req, res, next);

    expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('passes search query to prisma', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([]);
    mockPrisma.patient.count.mockResolvedValue(0);

    const req = mockReq({ query: { search: 'John' } });
    const res = mockRes();
    const next = mockNext();

    await listPatients(req, res, next);

    expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: { contains: 'John' } }),
          ]),
        }),
      }),
    );
  });

  it('calls next with error on failure', async () => {
    const error = new Error('Database error');
    mockPrisma.patient.findMany.mockRejectedValue(error);

    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await listPatients(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

// =============================================================================
describe('getPatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns patient detail when found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(mockPatient);

    const req = mockReq({ params: { id: '1' } });
    const res = mockRes();
    const next = mockNext();

    await getPatient(req, res, next);

    expect(mockPrisma.patient.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: 1 }),
      }),
    );
  });

  it('returns 404 when patient not found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '999' } });
    const res = mockRes();
    const next = mockNext();

    await getPatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('rejects non-numeric patient id', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();
    const next = mockNext();

    await getPatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// =============================================================================
describe('createPatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a patient with valid data', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    mockPrisma.patient.create.mockResolvedValue(mockPatient);
    mockPrisma.auditLog.create.mockResolvedValue({});

    const req = mockReq({
      body: {
        name: 'John Doe',
        gender: 'L',
        birthDate: '1990-01-01',
        nik: '3201012000010001',
        bloodType: 'O',
        height: '175',
        weight: '70',
      },
    });
    const res = mockRes();
    const next = mockNext();

    await createPatient(req, res, next);

    expect(mockPrisma.patient.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Patient created successfully',
      }),
    );
  });

  it('validates required fields', async () => {
    const req = mockReq({ body: { name: 'A', gender: 'X' } });
    const res = mockRes();
    const next = mockNext();

    await createPatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('validates NIK format (16 digits)', async () => {
    const req = mockReq({
      body: {
        name: 'John Doe',
        gender: 'L',
        birthDate: '1990-01-01',
        nik: '12345',
      },
    });
    const res = mockRes();
    const next = mockNext();

    await createPatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('checks NIK uniqueness', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(mockPatient);

    const req = mockReq({
      body: {
        name: 'John Doe',
        gender: 'L',
        birthDate: '1990-01-01',
        nik: '3201012000010001',
      },
    });
    const res = mockRes();
    const next = mockNext();

    await createPatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('generates sequential patient ID (P-001, P-002, ...)', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      patientId: 'P-005',
    } as any);
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    mockPrisma.patient.create.mockResolvedValue({
      ...mockPatient,
      patientId: 'P-006',
    });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const req = mockReq({
      body: {
        name: 'Jane Doe',
        gender: 'P',
        birthDate: '1992-05-15',
      },
    });
    const res = mockRes();
    const next = mockNext();

    await createPatient(req, res, next);

    expect(mockPrisma.patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ patientId: 'P-006' }),
      }),
    );
  });
});

// =============================================================================
describe('updatePatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an existing patient', async () => {
    mockPrisma.patient.findUnique
      .mockResolvedValueOnce(mockPatient) // existence check
      .mockResolvedValueOnce(null); // NIK uniqueness check (no conflict)
    mockPrisma.patient.update.mockResolvedValue({ ...mockPatient, name: 'John Updated' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const req = mockReq({
      params: { id: '1' },
      body: { name: 'John Updated' },
    });
    const res = mockRes();
    const next = mockNext();

    await updatePatient(req, res, next);

    expect(mockPrisma.patient.update).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Patient updated successfully',
      }),
    );
  });

  it('returns 404 when patient not found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '999' }, body: { name: 'No one' } });
    const res = mockRes();
    const next = mockNext();

    await updatePatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('rejects non-numeric patient id', async () => {
    const req = mockReq({ params: { id: 'abc' }, body: { name: 'Test' } });
    const res = mockRes();
    const next = mockNext();

    await updatePatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// =============================================================================
describe('deletePatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a patient and related records', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(mockPatient);
    mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.reading.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.monitoringSession.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.patient.delete.mockResolvedValue(mockPatient);
    mockPrisma.auditLog.create.mockResolvedValue({});

    const req = mockReq({ params: { id: '1' } });
    const res = mockRes();
    const next = mockNext();

    await deletePatient(req, res, next);

    expect(mockPrisma.patient.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.reading.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.monitoringSession.deleteMany).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Patient deleted successfully',
      }),
    );
  });

  it('returns 404 when patient not found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const req = mockReq({ params: { id: '999' } });
    const res = mockRes();
    const next = mockNext();

    await deletePatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('rejects non-numeric patient id', async () => {
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();
    const next = mockNext();

    await deletePatient(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
