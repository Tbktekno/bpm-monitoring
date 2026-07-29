// =============================================================================
// MonitoringService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements realtime monitoring, history, and reading ingestion.
// Uses shared status-calculator logic for consistent classification.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import { PrismaClient } from '@prisma/client';
import { calculateStatuses } from '../../shared/status-calculator';

// ─── Format a reading to gRPC response shape ────────────────────────────────
function formatReading(r: any): any {
  return {
    id: r.id,
    patient_id: r.patient?.id ?? r.patientId,
    patient_name: r.patient?.name ?? '',
    patient_id_display: r.patient?.patientId ?? '',
    bpm: r.bpm,
    spo2: r.spo2,
    bpm_status: r.bpmStatus,
    spo2_status: r.spo2Status,
    status: r.status,
    created_at: r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt ?? ''),
  };
}

export function createMonitoringHandlers(prisma: PrismaClient) {
  return {

    // ─── GetRealtimeMonitoring ─────────────────────────────────────────────
    GetRealtimeMonitoring: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        // Fetch the latest reading for each active session
        const activeSessions = await prisma.monitoringSession.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true },
        });

        const activeSessionIds = activeSessions.map((s) => s.id);

        // Get the latest reading per active session
        const readings = await prisma.reading.findMany({
          where: {
            sessionId: { in: activeSessionIds },
          },
          orderBy: { createdAt: 'desc' },
          take: 50, // Get latest 50 readings across active sessions
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                patientId: true,
              },
            },
          },
        });

        // Deduplicate: keep only the latest reading per patient
        const latestPerPatient = new Map<number, any>();
        for (const r of readings) {
          const pid = r.patient?.id ?? 0;
          if (!latestPerPatient.has(pid)) {
            latestPerPatient.set(pid, r);
          }
        }

        callback(null, {
          readings: Array.from(latestPerPatient.values()).map(formatReading),
          total_active_sessions: activeSessions.length,
        });
      } catch (error) {
        console.error('[MonitoringService.GetRealtimeMonitoring]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── GetMonitoringHistory ──────────────────────────────────────────────
    GetMonitoringHistory: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const {
          patient_id,
          page = 1,
          limit = 20,
        } = call.request;

        if (!patient_id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient ID is required',
          });
        }

        const currentPage = Math.max(1, Math.floor(page));
        const pageLimit = Math.min(100, Math.max(1, Math.floor(limit)));
        const skip = (currentPage - 1) * pageLimit;

        const [readings, total] = await Promise.all([
          prisma.reading.findMany({
            where: { patientId: patient_id },
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageLimit,
            include: {
              patient: {
                select: {
                  id: true,
                  name: true,
                  patientId: true,
                },
              },
            },
          }),
          prisma.reading.count({
            where: { patientId: patient_id },
          }),
        ]);

        callback(null, {
          readings: readings.map(formatReading),
          pagination: {
            page: currentPage,
            limit: pageLimit,
            total,
            total_pages: Math.ceil(total / pageLimit),
          },
        });
      } catch (error) {
        console.error('[MonitoringService.GetMonitoringHistory]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── SaveReading ───────────────────────────────────────────────────────
    SaveReading: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const {
          patient_id,
          bpm,
          spo2,
          session_id,
        } = call.request;

        if (!patient_id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Patient ID is required',
          });
        }

        if (bpm == null || bpm < 30 || bpm > 250) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'BPM must be between 30 and 250',
          });
        }

        if (spo2 == null || spo2 < 50 || spo2 > 100) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'SpO₂ must be between 50 and 100',
          });
        }

        // Verify patient exists
        const patient = await prisma.patient.findUnique({
          where: { id: patient_id },
        });

        if (!patient) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: `Patient with ID ${patient_id} not found`,
          });
        }

        // Calculate statuses using shared logic
        const { bpmStatus, spo2Status, status } = calculateStatuses(bpm, spo2);

        // Find or create active session for this patient
        let sessionId = session_id;
        if (!sessionId) {
          let session = await prisma.monitoringSession.findFirst({
            where: {
              patientId: patient_id,
              status: 'ACTIVE',
            },
            orderBy: { startTime: 'desc' },
          });

          if (!session) {
            session = await prisma.monitoringSession.create({
              data: {
                patientId: patient_id,
                status: 'ACTIVE',
                startTime: new Date(),
              },
            });
          }

          sessionId = session.id;
        }

        // Save the reading
        const reading = await prisma.reading.create({
          data: {
            patientId: patient_id,
            sessionId,
            bpm,
            spo2,
            bpmStatus,
            spo2Status,
            status,
          },
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                patientId: true,
              },
            },
          },
        });

        callback(null, formatReading(reading));
      } catch (error) {
        console.error('[MonitoringService.SaveReading]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}
