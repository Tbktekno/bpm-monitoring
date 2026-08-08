// =============================================================================
// ReportService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements daily report, monthly report, and data export.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import { PrismaClient } from '@prisma/client';

// ─── Build a ReportResponse from raw data ───────────────────────────────────
function buildReportResponse(
  period: string,
  readings: any[],
): any {
  if (readings.length === 0) {
    return {
      period,
      total_readings: 0,
      total_patients: 0,
      normal_count: 0,
      waspada_count: 0,
      darurat_count: 0,
      avg_bpm: 0,
      avg_spo2: 0,
      min_bpm: 0,
      max_bpm: 0,
      min_spo2: 0,
      max_spo2: 0,
      bpm_distribution: [],
      spo2_distribution: [],
    };
  }

  const total = readings.length;

  // Unique patients
  const uniquePatients = new Set(readings.map((r) => r.patientId)).size;

  // Status counts (NORMAL vs perlu pemeriksaan — includes legacy WASPADA/DARURAT)
  const statusCounts: Record<string, number> = { NORMAL: 0, WASPADA: 0, DARURAT: 0 };
  const bpmCounts: Record<string, number> = {};
  const spo2Counts: Record<string, number> = {};

  let sumBpm = 0;
  let sumSpo2 = 0;
  let minBpm = readings[0].bpm;
  let maxBpm = readings[0].bpm;
  let minSpo2 = readings[0].spo2;
  let maxSpo2 = readings[0].spo2;

  for (const r of readings) {
    // Status
    if (r.status === 'NORMAL') statusCounts.NORMAL++;
    else statusCounts.WASPADA++;

    // BPM distribution
    bpmCounts[r.bpmStatus] = (bpmCounts[r.bpmStatus] ?? 0) + 1;

    // SpO₂ distribution
    spo2Counts[r.spo2Status] = (spo2Counts[r.spo2Status] ?? 0) + 1;

    // Aggregates
    sumBpm += r.bpm;
    sumSpo2 += r.spo2;
    if (r.bpm < minBpm) minBpm = r.bpm;
    if (r.bpm > maxBpm) maxBpm = r.bpm;
    if (r.spo2 < minSpo2) minSpo2 = r.spo2;
    if (r.spo2 > maxSpo2) maxSpo2 = r.spo2;
  }

  return {
    period,
    total_readings: total,
    total_patients: uniquePatients,
    normal_count: statusCounts.NORMAL,
    waspada_count: statusCounts.WASPADA,
    darurat_count: statusCounts.DARURAT,
    avg_bpm: Math.round((sumBpm / total) * 100) / 100,
    avg_spo2: Math.round((sumSpo2 / total) * 100) / 100,
    min_bpm: minBpm,
    max_bpm: maxBpm,
    min_spo2: minSpo2,
    max_spo2: maxSpo2,
    bpm_distribution: Object.entries(bpmCounts).map(([status, count]) => ({
      status,
      count,
    })),
    spo2_distribution: Object.entries(spo2Counts).map(([status, count]) => ({
      status,
      count,
    })),
  };
}

export function createReportHandlers(prisma: PrismaClient) {
  return {

    // ─── GetDailyReport ────────────────────────────────────────────────────
    GetDailyReport: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { date } = call.request;

        // Parse date or use today
        const reportDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(
          reportDate.getFullYear(),
          reportDate.getMonth(),
          reportDate.getDate(),
        );
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const readings = await prisma.reading.findMany({
          where: {
            createdAt: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
        });

        const period = startOfDay.toISOString().split('T')[0];
        callback(null, buildReportResponse(period, readings));
      } catch (error) {
        console.error('[ReportService.GetDailyReport]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── GetMonthlyReport ──────────────────────────────────────────────────
    GetMonthlyReport: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { month, year } = call.request;

        const reportYear = year || new Date().getFullYear();
        const reportMonth = month
          ? Math.max(1, Math.min(12, month)) - 1
          : new Date().getMonth();

        const startOfMonth = new Date(reportYear, reportMonth, 1);
        const endOfMonth = new Date(reportYear, reportMonth + 1, 1);

        const readings = await prisma.reading.findMany({
          where: {
            createdAt: {
              gte: startOfMonth,
              lt: endOfMonth,
            },
          },
        });

        const period = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}`;
        callback(null, buildReportResponse(period, readings));
      } catch (error) {
        console.error('[ReportService.GetMonthlyReport]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── ExportReport ──────────────────────────────────────────────────────
    ExportReport: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const {
          type = 'daily',
          date_from,
          date_to,
          format = 'json',
        } = call.request;

        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        switch (type) {
          case 'daily': {
            const d = date_from ? new Date(date_from) : now;
            startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            break;
          }
          case 'monthly': {
            const m = date_from ? new Date(date_from) : now;
            startDate = new Date(m.getFullYear(), m.getMonth(), 1);
            endDate = new Date(m.getFullYear(), m.getMonth() + 1, 1);
            break;
          }
          case 'custom':
          default: {
            startDate = date_from ? new Date(date_from) : new Date(now.getFullYear(), 0, 1);
            endDate = date_to ? new Date(date_to) : now;
            endDate.setDate(endDate.getDate() + 1);
            break;
          }
        }

        const readings = await prisma.reading.findMany({
          where: {
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          },
          include: {
            patient: {
              select: { name: true, patientId: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        });

        // Build export data based on format
        let fileData: string;
        let mimeType: string;
        let fileName: string;

        switch (format) {
          case 'csv': {
            const header = 'ID,Waktu,Pasien,PatientID,BPM,SpO2,StatusBPM,StatusSpO2,Status';
            const rows = readings.map((r) =>
              [
                r.id,
                r.createdAt.toISOString(),
                `"${r.patient?.name ?? ''}"`,
                r.patient?.patientId ?? '',
                r.bpm,
                r.spo2,
                r.bpmStatus,
                r.spo2Status,
                r.status,
              ].join(','),
            );
            fileData = [header, ...rows].join('\n');
            mimeType = 'text/csv';
            fileName = `export_${startDate.toISOString().split('T')[0]}.csv`;
            break;
          }
          case 'json':
          default: {
            const jsonData = readings.map((r) => ({
              id: r.id,
              timestamp: r.createdAt.toISOString(),
              patient: r.patient?.name ?? '',
              patient_id: r.patient?.patientId ?? '',
              bpm: r.bpm,
              spo2: r.spo2,
              bpm_status: r.bpmStatus,
              spo2_status: r.spo2Status,
              status: r.status,
            }));
            fileData = JSON.stringify(jsonData, null, 2);
            mimeType = 'application/json';
            fileName = `export_${startDate.toISOString().split('T')[0]}.json`;
            break;
          }
        }

        callback(null, {
          file_url: '', // Would be a real URL in production
          file_data: fileData,
          file_name: fileName,
          mime_type: mimeType,
        });
      } catch (error) {
        console.error('[ReportService.ExportReport]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}
