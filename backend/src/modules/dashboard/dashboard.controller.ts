// =============================================================================
// Dashboard Controller — Aggregated Stats & Overview
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../server/middleware/request-logger';

/**
 * GET /api/v1/dashboard
 * Returns aggregated dashboard statistics.
 */
export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Total patients ─────────────────────────────────────────────────────
    const totalPatients = await prisma.patient.count();

    // ─── Status distribution (from latest reading per patient) ───────────────
    // Use Prisma aggregation instead of loading all patients into memory.
    // Step 1: get the max reading ID per patient (auto-increment = latest).
    const latestReadingIds = await prisma.reading.groupBy({
      by: ['patientId'],
      _max: { id: true },
    });

    const statusIds = latestReadingIds
      .map((r) => r._max.id)
      .filter((id): id is number => id !== null);

    // Step 2: fetch only the status field for those latest readings.
    const latestStatuses = statusIds.length > 0
      ? await prisma.reading.findMany({
          where: { id: { in: statusIds } },
          select: { status: true },
        })
      : [];

    let normalCount = 0;
    let perluPemeriksaanCount = 0;

    for (const r of latestStatuses) {
      if (r.status === 'NORMAL') normalCount++;
      else perluPemeriksaanCount++;
    }

    // ─── Average BPM and SpO₂ from recent readings ──────────────────────────
    // Strategy: try last 24h → last 7 days → all-time (so averages never show 0
    // when data exists in the database but is outside the 24h window).
    type AvgResult = { avgBpm: number; avgSpo2: number; totalReadings: number; range: string };

    async function computeAverages(hours: number): Promise<AvgResult | null> {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const rows = await prisma.reading.findMany({
        where: { createdAt: { gte: since } },
        select: { bpm: true, spo2: true },
      });
      if (rows.length === 0) return null;
      return {
        avgBpm: Math.round(rows.reduce((s, r) => s + r.bpm, 0) / rows.length),
        avgSpo2: Math.round(rows.reduce((s, r) => s + r.spo2, 0) / rows.length),
        totalReadings: rows.length,
        range: `${hours}h`,
      };
    }

    let averages: AvgResult;
    const avg24h = await computeAverages(24);
    if (avg24h) {
      averages = avg24h;
    } else {
      const avg7d = await computeAverages(7 * 24);
      if (avg7d) {
        averages = avg7d;
      } else {
        // Fallback: all-time averages
        const allRows = await prisma.reading.findMany({
          select: { bpm: true, spo2: true },
        });
        averages = allRows.length > 0
          ? {
              avgBpm: Math.round(allRows.reduce((s, r) => s + r.bpm, 0) / allRows.length),
              avgSpo2: Math.round(allRows.reduce((s, r) => s + r.spo2, 0) / allRows.length),
              totalReadings: allRows.length,
              range: 'all',
            }
          : { avgBpm: 0, avgSpo2: 0, totalReadings: 0, range: 'none' };
      }
    }

    // ─── Last 10 readings (all time) ────────────────────────────────────────
    const last10Readings = await prisma.reading.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        patient: {
          select: { id: true, patientId: true, name: true },
        },
      },
    });

    // ─── Today's readings chart data (hourly buckets) ───────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayReadings = await prisma.reading.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { bpm: true, spo2: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate by hour
    const hourlyMap = new Map<string, { bpmValues: number[]; spo2Values: number[]; count: number }>();
    for (const r of todayReadings) {
      const hour = new Date(r.createdAt).getHours();
      const key = `${hour.toString().padStart(2, '0')}:00`;
      if (!hourlyMap.has(key)) {
        hourlyMap.set(key, { bpmValues: [], spo2Values: [], count: 0 });
      }
      const bucket = hourlyMap.get(key)!;
      bucket.bpmValues.push(r.bpm);
      bucket.spo2Values.push(r.spo2);
      bucket.count++;
    }

    const chartData = Array.from(hourlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => ({
        hour,
        avgBpm: Math.round(data.bpmValues.reduce((s, v) => s + v, 0) / data.bpmValues.length),
        avgSpo2: Math.round(data.spo2Values.reduce((s, v) => s + v, 0) / data.spo2Values.length),
        readingCount: data.count,
      }));

    // ─── Response ───────────────────────────────────────────────────────────
    logger.info('Dashboard stats retrieved');

    res.json({
      success: true,
      data: {
        totalPatients,
        statusDistribution: {
          normal: normalCount,
          perluPemeriksaan: perluPemeriksaanCount,
          tanpaData: totalPatients - normalCount - perluPemeriksaanCount,
        },
        averages: {
          avgBpm: averages.avgBpm,
          avgSpo2: averages.avgSpo2,
          totalReadings: averages.totalReadings,
          range: averages.range,
        },
        last10Readings,
        chartData,
        timestamp: new Date().toISOString(),
      },
      message: 'Dashboard data retrieved',
    });
  } catch (err) {
    next(err);
  }
}
