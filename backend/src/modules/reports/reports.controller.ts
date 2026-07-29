// =============================================================================
// Reports Controller — Daily/Monthly Aggregation, PDF & Excel Export
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/database';
import { ValidationError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

// ─── Helper: date range ──────────────────────────────────────────────────────
function getDateRange(year: number, month?: number): { start: Date; end: Date } {
  if (month !== undefined) {
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

/**
 * GET /api/v1/reports/daily
 * Daily aggregation report — number of readings per day in a date range.
 */
export async function getDailyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let startDate = req.query.startDate ? new Date(String(req.query.startDate ?? '')) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let endDate = req.query.endDate ? new Date(String(req.query.endDate ?? '')) : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError('Invalid date format. Use ISO 8601 (YYYY-MM-DD)');
    }

    // ⚠ endDate harus akhir hari (23:59:59.999) agar mencakup seluruh hari
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Get all readings in date range
    const readings = await prisma.reading.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        createdAt: true,
        status: true,
        bpm: true,
        spo2: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const dailyMap = new Map<string, {
      date: string;
      totalReadings: number;
      normalCount: number;
      waspadaCount: number;
      daruratCount: number;
      avgBpm: number;
      avgSpo2: number;
      bpmValues: number[];
      spo2Values: number[];
    }>();

    for (const r of readings) {
      const day = r.createdAt.toISOString().split('T')[0];
      if (!dailyMap.has(day)) {
        dailyMap.set(day, {
          date: day,
          totalReadings: 0,
          normalCount: 0,
          waspadaCount: 0,
          daruratCount: 0,
          avgBpm: 0,
          avgSpo2: 0,
          bpmValues: [],
          spo2Values: [],
        });
      }
      const entry = dailyMap.get(day)!;
      entry.totalReadings++;
      if (r.status === 'NORMAL') entry.normalCount++;
      else if (r.status === 'WASPADA') entry.waspadaCount++;
      else if (r.status === 'DARURAT') entry.daruratCount++;
      entry.bpmValues.push(r.bpm);
      entry.spo2Values.push(r.spo2);
    }

    // Compute averages
    const dailyData = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        ...entry,
        avgBpm: Math.round(entry.bpmValues.reduce((s, v) => s + v, 0) / entry.bpmValues.length),
        avgSpo2: Math.round(entry.spo2Values.reduce((s, v) => s + v, 0) / entry.spo2Values.length),
        bpmValues: undefined,
        spo2Values: undefined,
      }));

    // Summary
    const totalReadings = readings.length;
    const normalCount = readings.filter((r) => r.status === 'NORMAL').length;
    const waspadaCount = readings.filter((r) => r.status === 'WASPADA').length;
    const daruratCount = readings.filter((r) => r.status === 'DARURAT').length;

    res.json({
      success: true,
      data: {
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
        summary: {
          totalReadings,
          normalCount,
          waspadaCount,
          daruratCount,
        },
        daily: dailyData,
      },
      message: 'Daily report generated',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reports/monthly
 * Monthly aggregation report — grouped by month.
 */
export async function getMonthlyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = parseInt(String(req.query.year ?? String(new Date().getFullYear())), 10);
    if (year < 2000 || year > 2100) {
      throw new ValidationError('Invalid year');
    }

    const { start, end } = getDateRange(year);

    const readings = await prisma.reading.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      select: {
        createdAt: true,
        status: true,
        bpm: true,
        spo2: true,
        patientId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyMap = new Map<number, {
      month: number;
      year: number;
      totalReadings: number;
      uniquePatients: Set<number>;
      normalCount: number;
      waspadaCount: number;
      daruratCount: number;
      bpmValues: number[];
      spo2Values: number[];
    }>();

    for (const r of readings) {
      const m = r.createdAt.getMonth() + 1;
      if (!monthlyMap.has(m)) {
        monthlyMap.set(m, {
          month: m,
          year,
          totalReadings: 0,
          uniquePatients: new Set(),
          normalCount: 0,
          waspadaCount: 0,
          daruratCount: 0,
          bpmValues: [],
          spo2Values: [],
        });
      }
      const entry = monthlyMap.get(m)!;
      entry.totalReadings++;
      if (r.patientId !== null) entry.uniquePatients.add(r.patientId);
      if (r.status === 'NORMAL') entry.normalCount++;
      else if (r.status === 'WASPADA') entry.waspadaCount++;
      else if (r.status === 'DARURAT') entry.daruratCount++;
      entry.bpmValues.push(r.bpm);
      entry.spo2Values.push(r.spo2);
    }

    const monthlyData = Array.from(monthlyMap.values())
      .sort((a, b) => a.month - b.month)
      .map((entry) => ({
        month: entry.month,
        year: entry.year,
        totalReadings: entry.totalReadings,
        uniquePatients: entry.uniquePatients.size,
        normalCount: entry.normalCount,
        waspadaCount: entry.waspadaCount,
        daruratCount: entry.daruratCount,
        avgBpm: Math.round(entry.bpmValues.reduce((s, v) => s + v, 0) / entry.bpmValues.length),
        avgSpo2: Math.round(entry.spo2Values.reduce((s, v) => s + v, 0) / entry.spo2Values.length),
      }));

    const totalForYear = readings.length;

    res.json({
      success: true,
      data: {
        year,
        summary: {
          totalReadings: totalForYear,
          totalPatients: new Set(readings.map((r) => r.patientId)).size,
        },
        monthly: monthlyData,
      },
      message: 'Monthly report generated',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reports/export/pdf
 * Exports a report as PDF using PDFKit.
 */
export async function exportPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reportType = String(req.query.type ?? 'daily');
    let startDate = req.query.startDate ? new Date(String(req.query.startDate ?? '')) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let endDate = req.query.endDate ? new Date(String(req.query.endDate ?? '')) : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError('Invalid date format');
    }

    // ⚠ endDate harus akhir hari
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Fetch data
    const readings = await prisma.reading.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        patient: {
          select: { patientId: true, name: true, gender: true, age: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    // Compute summary
    const normalCount = readings.filter((r) => r.status === 'NORMAL').length;
    const waspadaCount = readings.filter((r) => r.status === 'WASPADA').length;
    const daruratCount = readings.filter((r) => r.status === 'DARURAT').length;

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `BPM & SpO₂ Report - ${reportType}`,
        Author: 'BPM Monitoring Dashboard',
        Subject: `Report from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bpm-report-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('BPM & SpO\u2082 Monitoring Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
      .text(`Period: ${startDate.toISOString().split('T')[0]} — ${endDate.toISOString().split('T')[0]}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
    doc.moveDown(1);

    // Summary section
    doc.fontSize(14).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Readings: ${readings.length}`);
    doc.text(`Normal: ${normalCount}`);
    doc.text(`Waspada: ${waspadaCount}`);
    doc.text(`Darurat: ${daruratCount}`);
    doc.moveDown(1);

    // Readings table
    doc.fontSize(14).font('Helvetica-Bold').text('Reading Details');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 120;
    const col3 = 200;
    const col4 = 260;
    const col5 = 320;
    const col6 = 390;
    const col7 = 460;

    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Time', col1, tableTop);
    doc.text('Patient', col2, tableTop);
    doc.text('BPM', col3, tableTop);
    doc.text('SpO\u2082', col4, tableTop);
    doc.text('BPM Status', col5, tableTop);
    doc.text('SpO\u2082 Status', col6, tableTop);
    doc.text('Overall', col7, tableTop);
    doc.moveDown(0.5);

    doc.fontSize(7).font('Helvetica');
    let y = doc.y;

    for (const r of readings) {
      // Check if we need a new page
      if (y > 720) {
        doc.addPage();
        y = 50;
      }

      doc.text(r.createdAt.toLocaleString('id-ID'), col1, y, { width: 70 });
      doc.text(r.patient?.name || 'Unknown', col2, y, { width: 80 });
      doc.text(r.bpm.toString(), col3, y);
      doc.text(`${r.spo2}%`, col4, y);
      doc.text(r.bpmStatus, col5, y, { width: 70 });
      doc.text(r.spo2Status, col6, y, { width: 70 });
      doc.text(r.status, col7, y);
      y += 14;
    }

    doc.end();

    logger.info(`PDF exported: ${readings.length} readings`);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reports/export/excel
 * Exports a report as Excel file using ExcelJS.
 */
export async function exportExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let startDate = req.query.startDate ? new Date(String(req.query.startDate ?? '')) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let endDate = req.query.endDate ? new Date(String(req.query.endDate ?? '')) : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new ValidationError('Invalid date format');
    }

    // ⚠ endDate harus akhir hari
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Fetch data
    const readings = await prisma.reading.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        patient: {
          select: { patientId: true, name: true, gender: true, age: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    // Compute summary
    const normalCount = readings.filter((r) => r.status === 'NORMAL').length;
    const waspadaCount = readings.filter((r) => r.status === 'WASPADA').length;
    const daruratCount = readings.filter((r) => r.status === 'DARURAT').length;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BPM Monitoring Dashboard';
    workbook.created = new Date();

    // ── Summary sheet ────────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    summarySheet.addRow({ metric: 'Period Start', value: startDate.toISOString().split('T')[0] });
    summarySheet.addRow({ metric: 'Period End', value: endDate.toISOString().split('T')[0] });
    summarySheet.addRow({ metric: 'Total Readings', value: readings.length });
    summarySheet.addRow({ metric: 'Normal', value: normalCount });
    summarySheet.addRow({ metric: 'Waspada', value: waspadaCount });
    summarySheet.addRow({ metric: 'Darurat', value: daruratCount });

    // Style header
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // ── Readings sheet ───────────────────────────────────────────────────────
    const readingsSheet = workbook.addWorksheet('Readings');
    readingsSheet.columns = [
      { header: 'Date/Time', key: 'createdAt', width: 20 },
      { header: 'Patient ID', key: 'patientId', width: 12 },
      { header: 'Patient Name', key: 'patientName', width: 25 },
      { header: 'Gender', key: 'gender', width: 8 },
      { header: 'Age', key: 'age', width: 8 },
      { header: 'BPM', key: 'bpm', width: 8 },
      { header: 'SpO₂', key: 'spo2', width: 8 },
      { header: 'BPM Status', key: 'bpmStatus', width: 18 },
      { header: 'SpO₂ Status', key: 'spo2Status', width: 20 },
      { header: 'Overall Status', key: 'status', width: 15 },
    ];

    // Header styling
    readingsSheet.getRow(1).font = { bold: true };
    readingsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    readingsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data
    for (const r of readings) {
      readingsSheet.addRow({
        createdAt: r.createdAt.toISOString(),
        patientId: r.patient?.patientId || '',
        patientName: r.patient?.name || 'Unknown',
        gender: r.patient?.gender || '',
        age: r.patient?.age || 0,
        bpm: r.bpm,
        spo2: r.spo2,
        bpmStatus: r.bpmStatus,
        spo2Status: r.spo2Status,
        status: r.status,
      });
    }

    // ── Write to response ────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bpm-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

    logger.info(`Excel exported: ${readings.length} readings`);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reports/export/session-pdf
 * Export a single monitoring session as PDF.
 */
export async function exportSessionPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = parseInt(String(req.query.sessionId), 10);
    if (isNaN(sessionId)) {
      throw new ValidationError('Invalid session ID');
    }

    const session = await prisma.monitoringSession.findUnique({
      where: { id: sessionId },
      include: {
        patient: { select: { id: true, patientId: true, name: true } },
        readings: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!session) {
      throw new ValidationError('Session not found');
    }

    // Compute summary
    const readings = session.readings;
    const avgBpm = readings.length > 0 ? Math.round(readings.reduce((s, r) => s + r.bpm, 0) / readings.length) : 0;
    const avgSpo2 = readings.length > 0 ? Math.round(readings.reduce((s, r) => s + r.spo2, 0) / readings.length) : 0;
    const normalCount = readings.filter((r) => r.status === 'NORMAL').length;
    const waspadaCount = readings.filter((r) => r.status === 'WASPADA').length;
    const daruratCount = readings.filter((r) => r.status === 'DARURAT').length;

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sesi-${sessionId}-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Laporan Sesi Monitoring', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').text(`Pasien: ${session.patient?.name || '-'}`, { align: 'center' });
    doc.fontSize(10).text(`ID: ${session.patient?.patientId || '-'}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Mulai: ${session.startTime.toLocaleString('id-ID')}`, { align: 'center' });
    doc.text(`Selesai: ${session.endTime?.toLocaleString('id-ID') || '-'}`, { align: 'center' });
    doc.text(`Device: ${session.deviceId || '-'}`, { align: 'center' });
    doc.moveDown(1);

    // Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Ringkasan');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Data: ${readings.length}`);
    doc.text(`Rata-rata BPM: ${avgBpm} bpm`);
    doc.text(`Rata-rata SpO₂: ${avgSpo2}%`);
    doc.text(`Normal: ${normalCount} | Waspada: ${waspadaCount} | Darurat: ${daruratCount}`);
    doc.moveDown(1);

    // Readings table
    doc.fontSize(14).font('Helvetica-Bold').text('Detail Data');
    doc.moveDown(0.3);

    const cols = { time: 50, bpm: 180, spo2: 260, bpmStatus: 320, spo2Status: 390, status: 460 };
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Waktu', cols.time, doc.y);
    doc.text('BPM', cols.bpm, doc.y);
    doc.text('SpO₂', cols.spo2, doc.y);
    doc.text('BPM Status', cols.bpmStatus, doc.y);
    doc.text('SpO₂ Status', cols.spo2Status, doc.y);
    doc.text('Status', cols.status, doc.y);
    doc.moveDown(0.3);

    doc.fontSize(7).font('Helvetica');
    let y = doc.y;
    for (const r of readings) {
      if (y > 730) { doc.addPage(); y = 50; }
      doc.text(r.createdAt.toLocaleString('id-ID'), cols.time, y, { width: 125 });
      doc.text(String(r.bpm), cols.bpm, y);
      doc.text(`${r.spo2}%`, cols.spo2, y);
      doc.text(r.bpmStatus, cols.bpmStatus, y, { width: 70 });
      doc.text(r.spo2Status, cols.spo2Status, y, { width: 70 });
      doc.text(r.status, cols.status, y);
      y += 13;
    }

    doc.end();
    logger.info(`Session PDF exported: session=${sessionId} readings=${readings.length}`);
  } catch (err) {
    next(err);
  }
}
