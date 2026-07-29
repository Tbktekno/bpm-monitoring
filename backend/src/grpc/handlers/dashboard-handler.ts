// =============================================================================
// DashboardService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements GetDashboardStats RPC — the primary dashboard overview.
// Returns aggregate stats, recent readings, and status distributions.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import { PrismaClient } from '@prisma/client';

export function createDashboardHandlers(prisma: PrismaClient) {
  return {

    // ─── GetDashboardStats ──────────────────────────────────────────────────
    GetDashboardStats: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const now = new Date();
        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        // ── Run independent queries in parallel ───────────────────────────
        const [
          totalPatients,
          activeSessions,
          readingsToday,
          statusDistribution,
          recentReadings,
        ] = await Promise.all([
          // Total patients
          prisma.patient.count(),

          // Active monitoring sessions
          prisma.monitoringSession.count({
            where: { status: 'ACTIVE' },
          }),

          // Readings today
          prisma.reading.count({
            where: {
              createdAt: {
                gte: startOfToday,
                lt: startOfTomorrow,
              },
            },
          }),

          // Status distribution for all readings
          prisma.reading.groupBy({
            by: ['status'],
            _count: { status: true },
          }),

          // Recent 10 readings with patient info
          prisma.reading.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
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
        ]);

        // ── Compute BPM distribution ──────────────────────────────────────
        const bpmDistribution = await prisma.reading.groupBy({
          by: ['bpmStatus'],
          _count: { bpmStatus: true },
        });

        // ── Compute SpO₂ distribution ─────────────────────────────────────
        const spo2Distribution = await prisma.reading.groupBy({
          by: ['spo2Status'],
          _count: { spo2Status: true },
        });

        // ── Compute averages ──────────────────────────────────────────────
        const avgResult = await prisma.reading.aggregate({
          _avg: { bpm: true, spo2: true },
        });

        // ── Count by composite status ─────────────────────────────────────
        const normalCount = statusDistribution
          .find((s) => s.status === 'NORMAL')
          ?._count?.status ?? 0;
        const waspadaCount = statusDistribution
          .find((s) => s.status === 'WASPADA')
          ?._count?.status ?? 0;
        const daruratCount = statusDistribution
          .find((s) => s.status === 'DARURAT')
          ?._count?.status ?? 0;

        // ── Build response ────────────────────────────────────────────────
        callback(null, {
          total_patients: totalPatients,
          active_sessions: activeSessions,
          readings_today: readingsToday,
          normal_readings: normalCount,
          waspada_readings: waspadaCount,
          darurat_readings: daruratCount,
          avg_bpm: Math.round((avgResult._avg.bpm ?? 0) * 100) / 100,
          avg_spo2: Math.round((avgResult._avg.spo2 ?? 0) * 100) / 100,
          recent_readings: recentReadings.map((r) => ({
            id: r.id,
            patient_id: r.patient?.id ?? 0,
            patient_name: r.patient?.name ?? 'Tidak Diketahui',
            patient_id_display: r.patient?.patientId ?? '-',
            bpm: r.bpm,
            spo2: r.spo2,
            bpm_status: r.bpmStatus,
            spo2_status: r.spo2Status,
            status: r.status,
            created_at: r.createdAt.toISOString(),
          })),
          bpm_distribution: bpmDistribution.map((d) => ({
            status: d.bpmStatus,
            count: d._count.bpmStatus,
          })),
          spo2_distribution: spo2Distribution.map((d) => ({
            status: d.spo2Status,
            count: d._count.spo2Status,
          })),
        });
      } catch (error) {
        console.error('[DashboardService.GetDashboardStats]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}
