// =============================================================================
// PatientService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements full CRUD for Patient records.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import { PrismaClient } from '@prisma/client';

// ─── Allowed sort columns ───────────────────────────────────────────────────
const SORTABLE_COLUMNS = new Set([
  'id',
  'patientId',
  'name',
  'age',
  'gender',
  'createdAt',
  'updatedAt',
]);

const SORT_COLUMN_MAP: Record<string, string> = {
  id: 'id',
  patient_id: 'patientId',
  name: 'name',
  age: 'age',
  gender: 'gender',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

// ─── Format patient to gRPC response ────────────────────────────────────────
function formatPatient(p: any) {
  return {
    id: p.id,
    patient_id: p.patientId,
    name: p.name,
    nik: p.nik ?? '',
    gender: p.gender,
    birth_date: p.birthDate instanceof Date
      ? p.birthDate.toISOString().split('T')[0]
      : String(p.birthDate ?? ''),
    age: p.age,
    address: p.address ?? '',
    phone: p.phone ?? '',
    blood_type: p.bloodType ?? '',
    height: p.height ?? 0,
    weight: p.weight ?? 0,
    created_at: p.createdAt instanceof Date
      ? p.createdAt.toISOString()
      : String(p.createdAt ?? ''),
    updated_at: p.updatedAt instanceof Date
      ? p.updatedAt.toISOString()
      : String(p.updatedAt ?? ''),
  };
}

export function createPatientHandlers(prisma: PrismaClient) {
  return {

    // ─── ListPatients ──────────────────────────────────────────────────────
    ListPatients: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const {
          page = 1,
          limit = 10,
          search = '',
          sort_by = 'createdAt',
          sort_order = 'desc',
        } = call.request;

        const currentPage = Math.max(1, Math.floor(page));
        const pageLimit = Math.min(100, Math.max(1, Math.floor(limit)));
        const skip = (currentPage - 1) * pageLimit;

        const orderColumn = SORT_COLUMN_MAP[sort_by] ?? 'createdAt';
        const orderDir = sort_order === 'asc' ? 'asc' : 'desc';

        // Build search filter
        const where: any = {};
        if (search) {
          where.OR = [
            { name: { contains: search } },
            { patientId: { contains: search } },
            { nik: { contains: search } },
          ];
        }

        const [patients, total] = await Promise.all([
          prisma.patient.findMany({
            where,
            skip,
            take: pageLimit,
            orderBy: { [orderColumn]: orderDir },
          }),
          prisma.patient.count({ where }),
        ]);

        callback(null, {
          patients: patients.map(formatPatient),
          pagination: {
            page: currentPage,
            limit: pageLimit,
            total,
            total_pages: Math.ceil(total / pageLimit),
          },
        });
      } catch (error) {
        console.error('[PatientService.ListPatients]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── GetPatient ─────────────────────────────────────────────────────────
    GetPatient: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { id } = call.request;

        if (!id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient ID is required',
          });
        }

        const patient = await prisma.patient.findUnique({
          where: { id },
        });

        if (!patient) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: `Patient with ID ${id} not found`,
          });
        }

        callback(null, formatPatient(patient));
      } catch (error) {
        console.error('[PatientService.GetPatient]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── CreatePatient ─────────────────────────────────────────────────────
    CreatePatient: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const req = call.request;

        if (!req.name || !req.gender) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient name and gender are required',
          });
        }

        if (!['L', 'P'].includes(req.gender)) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Gender must be L or P',
          });
        }

        const patient = await prisma.patient.create({
          data: {
            patientId: req.patient_id || undefined,
            name: req.name,
            nik: req.nik || undefined,
            gender: req.gender,
            birthDate: req.birth_date ? new Date(req.birth_date) : new Date(),
            age: req.age ?? 0,
            address: req.address || undefined,
            phone: req.phone || undefined,
            bloodType: req.blood_type || undefined,
            height: req.height || undefined,
            weight: req.weight || undefined,
          },
        });

        callback(null, formatPatient(patient));
      } catch (error: any) {
        console.error('[PatientService.CreatePatient]', error);

        if (error.code === 'P2002') {
          const target = error.meta?.target?.[0] ?? 'field';
          return callback({
            code: grpc.status.ALREADY_EXISTS,
            message: `A patient with this ${target} already exists`,
          });
        }

        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── UpdatePatient ─────────────────────────────────────────────────────
    UpdatePatient: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const req = call.request;
        const { id } = req;

        if (!id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient ID is required',
          });
        }

        // Verify patient exists
        const existing = await prisma.patient.findUnique({ where: { id } });
        if (!existing) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: `Patient with ID ${id} not found`,
          });
        }

        const updateData: any = {};
        if (req.patient_id !== undefined && req.patient_id !== '') {
          updateData.patientId = req.patient_id;
        }
        if (req.name !== undefined && req.name !== '') {
          updateData.name = req.name;
        }
        if (req.nik !== undefined) {
          updateData.nik = req.nik || null;
        }
        if (req.gender !== undefined && req.gender !== '') {
          if (!['L', 'P'].includes(req.gender)) {
            return callback({
              code: grpc.status.INVALID_ARGUMENT,
              message: 'Gender must be L or P',
            });
          }
          updateData.gender = req.gender;
        }
        if (req.birth_date !== undefined && req.birth_date !== '') {
          updateData.birthDate = new Date(req.birth_date);
        }
        if (req.age !== undefined && req.age > 0) {
          updateData.age = req.age;
        }
        if (req.address !== undefined) {
          updateData.address = req.address || null;
        }
        if (req.phone !== undefined) {
          updateData.phone = req.phone || null;
        }
        if (req.blood_type !== undefined) {
          updateData.bloodType = req.blood_type || null;
        }
        if (req.height !== undefined) {
          updateData.height = req.height || null;
        }
        if (req.weight !== undefined) {
          updateData.weight = req.weight || null;
        }

        const patient = await prisma.patient.update({
          where: { id },
          data: updateData,
        });

        callback(null, formatPatient(patient));
      } catch (error: any) {
        console.error('[PatientService.UpdatePatient]', error);

        if (error.code === 'P2002') {
          const target = error.meta?.target?.[0] ?? 'field';
          return callback({
            code: grpc.status.ALREADY_EXISTS,
            message: `A patient with this ${target} already exists`,
          });
        }

        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── DeletePatient ─────────────────────────────────────────────────────
    DeletePatient: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { id } = call.request;

        if (!id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient ID is required',
          });
        }

        const existing = await prisma.patient.findUnique({ where: { id } });
        if (!existing) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: `Patient with ID ${id} not found`,
          });
        }

        // Delete related records first to respect FK constraints
        await prisma.$transaction([
          prisma.reading.deleteMany({ where: { patientId: id } }),
          prisma.monitoringSession.deleteMany({ where: { patientId: id } }),
          prisma.auditLog.deleteMany({ where: { patientId: id } }),
          prisma.patient.delete({ where: { id } }),
        ]);

        callback(null, {
          success: true,
          message: `Patient ${existing.patientId} (${existing.name}) deleted successfully`,
        });
      } catch (error) {
        console.error('[PatientService.DeletePatient]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}
