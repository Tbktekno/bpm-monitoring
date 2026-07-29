// =============================================================================
// Patients Controller — CRUD + Search + Detail
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

// ─── Helper: compute age from birthDate ──────────────────────────────────────
function computeAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ─── Helper: generate next patientId ─────────────────────────────────────────
async function generatePatientId(): Promise<string> {
  const lastPatient = await prisma.patient.findFirst({
    orderBy: { id: 'desc' },
    select: { patientId: true },
  });

  let nextNum = 1;
  if (lastPatient) {
    const match = lastPatient.patientId.match(/^P-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `P-${nextNum.toString().padStart(3, '0')}`;
}

// ─── Validation helpers ──────────────────────────────────────────────────────
function validatePatientInput(body: any, isUpdate: boolean = false): void {
  const errors: Record<string, string> = {};

  if (!isUpdate || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
  }

  if (!isUpdate || body.gender !== undefined) {
    if (!body.gender || !['L', 'P'].includes(body.gender)) {
      errors.gender = 'Gender must be L or P';
    }
  }

  if (!isUpdate || body.birthDate !== undefined) {
    if (!body.birthDate) {
      errors.birthDate = 'Birth date is required';
    } else {
      const d = new Date(body.birthDate);
      if (isNaN(d.getTime())) {
        errors.birthDate = 'Invalid birth date format';
      }
    }
  }

  if (body.nik !== undefined && body.nik !== null && body.nik !== '') {
    if (!/^\d{16}$/.test(body.nik)) {
      errors.nik = 'NIK must be exactly 16 digits';
    }
  }

  if (body.bloodType !== undefined && body.bloodType !== null && body.bloodType !== '') {
    if (!['A', 'B', 'AB', 'O'].includes(body.bloodType)) {
      errors.bloodType = 'Blood type must be A, B, AB, or O';
    }
  }

  if (body.height !== undefined && body.height !== null) {
    const h = parseFloat(body.height);
    if (isNaN(h) || h < 50 || h > 250) {
      errors.height = 'Height must be between 50 and 250 cm';
    }
  }

  if (body.weight !== undefined && body.weight !== null) {
    const w = parseFloat(body.weight);
    if (isNaN(w) || w < 2 || w > 300) {
      errors.weight = 'Weight must be between 2 and 300 kg';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * GET /api/v1/patients
 * List patients with pagination and search.
 */
export async function listPatients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));
    const search = String(req.query.search ?? '');
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { patientId: { contains: search } },
      ];
      if (/^\d+$/.test(search)) {
        where.OR.push({ nik: { contains: search } });
      }
    }

    const [data, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          readings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, bpm: true, spo2: true, createdAt: true },
          },
          _count: {
            select: { readings: true },
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    logger.info(`Patients list: page=${page} limit=${limit} search="${search}" total=${total}`);

    res.json({
      success: true,
      data: {
        items: data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'Patients retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/patients/:id
 * Get patient detail with recent readings.
 */
export async function getPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      throw new ValidationError('Invalid patient ID');
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        readings: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            session: {
              select: { id: true, status: true, startTime: true },
            },
          },
        },
        sessions: {
          orderBy: { startTime: 'desc' },
          take: 5,
          include: {
            _count: { select: { readings: true } },
          },
        },
        _count: {
          select: { readings: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundError('Patient');
    }

    logger.info(`Patient detail: id=${id} name=${patient.name}`);

    res.json({
      success: true,
      data: patient,
      message: 'Patient retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/patients
 * Create a new patient.
 */
export async function createPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    validatePatientInput(req.body);

    const {
      name, nik, gender, birthDate, address, phone,
      bloodType, height, weight, medicalHistory, doctorNote,
    } = req.body;

    const parsedBirthDate = new Date(birthDate);
    const age = computeAge(parsedBirthDate);

    // Check NIK uniqueness if provided
    if (nik) {
      const existingNik = await prisma.patient.findUnique({ where: { nik } });
      if (existingNik) {
        throw new ValidationError('NIK already exists', { nik: 'NIK already registered' });
      }
    }

    const patientId = await generatePatientId();

    const patient = await prisma.patient.create({
      data: {
        patientId,
        name: name.trim(),
        nik: nik || null,
        gender,
        birthDate: parsedBirthDate,
        age,
        address: address || null,
        phone: phone || null,
        bloodType: bloodType || null,
        height: height ? parseFloat(height) : null,
        weight: weight ? parseFloat(weight) : null,
        medicalHistory: medicalHistory || null,
        doctorNote: doctorNote || null,
      },
    });

    // Audit log
    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          patientId: patient.id,
          action: 'CREATE',
          details: `Created patient ${patient.name} (${patient.patientId})`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`Patient created: ${patient.patientId} - ${patient.name}`);

    res.status(201).json({
      success: true,
      data: patient,
      message: 'Patient created successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/patients/:id
 * Update an existing patient.
 */
export async function updatePatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      throw new ValidationError('Invalid patient ID');
    }

    // Check patient exists
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Patient');
    }

    validatePatientInput(req.body, true);

    const {
      name, nik, gender, birthDate, address, phone,
      bloodType, height, weight, medicalHistory, doctorNote,
    } = req.body;

    const data: any = {};

    if (name !== undefined) data.name = name.trim();
    if (nik !== undefined) {
      if (nik && nik !== existing.nik) {
        const existingNik = await prisma.patient.findUnique({ where: { nik } });
        if (existingNik && existingNik.id !== id) {
          throw new ValidationError('NIK already exists', { nik: 'NIK already registered' });
        }
      }
      data.nik = nik || null;
    }
    if (gender !== undefined) data.gender = gender;
    if (birthDate !== undefined) {
      data.birthDate = new Date(birthDate);
      data.age = computeAge(data.birthDate);
    }
    if (address !== undefined) data.address = address || null;
    if (phone !== undefined) data.phone = phone || null;
    if (bloodType !== undefined) data.bloodType = bloodType || null;
    if (height !== undefined) data.height = height ? parseFloat(height) : null;
    if (weight !== undefined) data.weight = weight ? parseFloat(weight) : null;
    if (medicalHistory !== undefined) data.medicalHistory = medicalHistory || null;
    if (doctorNote !== undefined) data.doctorNote = doctorNote || null;

    const patient = await prisma.patient.update({
      where: { id },
      data,
    });

    // Audit log
    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          patientId: patient.id,
          action: 'UPDATE',
          details: `Updated patient ${patient.name} (${patient.patientId})`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`Patient updated: ${patient.patientId} - ${patient.name}`);

    res.json({
      success: true,
      data: patient,
      message: 'Patient updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/patients/:id
 * Soft-delete: we keep the record (no soft-delete field, so we clear identifiable info).
 * Alternatively, we cascade delete. Here we remove the patient and related records.
 */
export async function deletePatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      throw new ValidationError('Invalid patient ID');
    }

    const patient = await prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundError('Patient');
    }

    // Delete related records first (cascade manually for SQLite)
    await prisma.auditLog.deleteMany({ where: { patientId: id } });
    await prisma.reading.deleteMany({ where: { patientId: id } });
    await prisma.monitoringSession.deleteMany({ where: { patientId: id } });
    await prisma.patient.delete({ where: { id } });

    // Audit log
    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'DELETE',
          details: `Deleted patient ${patient.name} (${patient.patientId})`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`Patient deleted: ${patient.patientId} - ${patient.name}`);

    res.json({
      success: true,
      data: null,
      message: 'Patient deleted successfully',
    });
  } catch (err) {
    next(err);
  }
}
