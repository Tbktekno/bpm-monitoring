// =============================================================================
// Reports Controller — Daily/Monthly Aggregation & PDF Export
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import PDFDocument from 'pdfkit';
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
 * Classification based on average BPM & SpO₂.
 * Consistent with the frontend calculateDiseaseStatus:
 * - SpO₂ < 90%: Dugaan Hipoksemia
 * - SpO₂ 90-94%: Penurunan Saturasi Oksigen
 * - BPM < 60: Dugaan Bradikardia
 * - BPM > 100: Dugaan Takikardia
 * - otherwise: Normal
 */
function calculateDiseaseStatus(bpm: number, spo2: number): string {
  if (spo2 < 90) return 'Dugaan Hipoksemia';
  if (spo2 < 95) return 'Penurunan Saturasi Oksigen';
  if (bpm < 60) return 'Dugaan Bradikardia';
  if (bpm > 100) return 'Dugaan Takikardia';
  return 'Normal';
}

// ─── PDF table helpers ────────────────────────────────────────────────────────
type PdfCell = string | { text: string; bold?: boolean; color?: string };

/**
 * Draw a bordered grid table on the PDF document.
 * Returns the Y coordinate right after the last drawn row.
 */
function drawPdfTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  colWidths: number[],
  header: string[],
  rows: PdfCell[][],
  options: { headerBg?: string; cellHeight?: number } = {}
): number {
  const cellHeight = options.cellHeight ?? 22;
  const headerHeight = 26;
  const headerBg = options.headerBg || '#E2E8F0';
  const left = doc.page.margins.left;
  let y = startY;

  // Header row
  let x = left;
  for (let i = 0; i < header.length; i++) {
    doc.rect(x, y, colWidths[i], headerHeight).fillAndStroke(headerBg, '#94A3B8');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1E293B');
    doc.text(header[i], x + 5, y + (headerHeight - 11) / 2, { width: colWidths[i] - 10, align: 'center' });
    x += colWidths[i];
  }
  y += headerHeight;

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    x = left;
    const row = rows[r];
    for (let c = 0; c < colWidths.length; c++) {
      doc.rect(x, y, colWidths[c], cellHeight).stroke('#94A3B8');
      const cell = row[c];
      const text = typeof cell === 'string' ? cell : cell?.text ?? '';
      const bold = typeof cell === 'string' ? false : Boolean(cell?.bold);
      const color = typeof cell === 'string' ? '#334155' : cell?.color ?? '#334155';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color);
      doc.text(text, x + 5, y + (cellHeight - 11) / 2, { width: colWidths[c] - 10, align: c === 0 ? 'left' : 'center' });
      x += colWidths[c];
    }
    y += cellHeight;
  }

  return y;
}

/**
 * Draw a full-width info row (two label/value pairs) used for patient data.
 * Returns the Y coordinate right after the drawn row.
 */
function drawInfoRow(
  doc: PDFKit.PDFDocument,
  startY: number,
  colWidths: number[],
  values: [string, string, string, string],
  options: { labelBg?: string; cellHeight?: number } = {}
): number {
  const cellHeight = options.cellHeight ?? 24;
  const labelBg = options.labelBg || '#F1F5F9';
  const left = doc.page.margins.left;
  let x = left;

  for (let i = 0; i < colWidths.length; i++) {
    const isLabel = i % 2 === 0;
    doc.rect(x, startY, colWidths[i], cellHeight).fillAndStroke(isLabel ? labelBg : '#FFFFFF', '#94A3B8');
    doc.font(isLabel ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(isLabel ? '#475569' : '#1E293B');
    doc.text(values[i] ?? '', x + 6, startY + (cellHeight - 11) / 2, { width: colWidths[i] - 12, align: 'left' });
    x += colWidths[i];
  }

  return startY + cellHeight;
}

function diagnosisColor(diagnosis: string): string {
  if (diagnosis === 'Normal') return '#16A34A';
  if (diagnosis === 'Dugaan Hipoksemia') return '#DC2626';
  return '#D97706';
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
      else entry.waspadaCount++;
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
    const waspadaCount = readings.filter((r) => r.status !== 'NORMAL').length;
    const daruratCount = 0;

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
      else entry.waspadaCount++;
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
    const perluPemeriksaanCount = readings.filter((r) => r.status !== 'NORMAL').length;

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
    doc.text(`Perlu Pemeriksaan: ${perluPemeriksaanCount}`);
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

    // Suspected disease based on average BPM & SpO₂
    const diagnosis = calculateDiseaseStatus(avgBpm, avgSpo2);

    // Resolve device display name from the registered ESP32 devices table
    const deviceInfo = session.deviceId
      ? await prisma.esp32Device.findUnique({ where: { deviceId: session.deviceId } })
      : null;
    const deviceName = deviceInfo?.label || session.deviceId || '—';

    const left = 50;
    const right = 545;
    const contentWidth = right - left;

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-sesi-${sessionId}-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // ── Document header ──────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 12).fill('#1E40AF');
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1E40AF')
      .text('LAPORAN HASIL MONITORING', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#475569')
      .text('Denyut Jantung (BPM) & Saturasi Oksigen (SpO\u2082)', { align: 'center' });
    doc.moveDown(0.4);

    // ── Patient & session info table ────────────────────────────────────────
    const infoCols = [105, 140, 105, 140];
    let y = doc.y;
    y = drawInfoRow(doc, y, infoCols, ['Nama Pasien', session.patient?.name || '-', 'ID Pasien', session.patient?.patientId || '-']);
    y = drawInfoRow(doc, y, infoCols, ['Waktu Mulai', session.startTime.toLocaleString('id-ID'), 'Waktu Selesai', session.endTime?.toLocaleString('id-ID') || '-']);
    y = drawInfoRow(doc, y, infoCols, ['Device', deviceName, 'Total Data', `${readings.length} data`]);
    doc.y = y + 18;

    // ── Results table ────────────────────────────────────────────────────────
    const bpmKeterangan = avgBpm < 60 ? 'Rendah' : avgBpm > 100 ? 'Tinggi' : 'Normal';
    const spo2Keterangan = avgSpo2 < 95 ? 'Rendah' : 'Normal';

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1E293B').text('HASIL PEMERIKSAAN');
    doc.moveDown(0.3);

    const resultCols = [170, 105, 110, 105];
    y = drawPdfTable(
      doc,
      doc.y,
      resultCols,
      ['Parameter', 'Rata-rata', 'Nilai Normal', 'Keterangan'],
      [
        [
          'BPM — Denyut Jantung',
          `${avgBpm} bpm`,
          '60 – 100 bpm',
          { text: bpmKeterangan, bold: true, color: bpmKeterangan === 'Normal' ? '#16A34A' : '#DC2626' },
        ],
        [
          'SpO\u2082 — Saturasi Oksigen',
          `${avgSpo2}%`,
          '95 – 100%',
          { text: spo2Keterangan, bold: true, color: spo2Keterangan === 'Normal' ? '#16A34A' : '#DC2626' },
        ],
      ],
      { cellHeight: 26 }
    );

    // ── Disease status box ───────────────────────────────────────────────────
    y = y + 14;
    doc.rect(left, y, contentWidth, 64).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text('STATUS PENYAKIT (DUGAAN)', left + 12, y + 10);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(diagnosisColor(diagnosis)).text(diagnosis, left + 12, y + 26);
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748B')
      .text(
        `Berdasarkan rata-rata BPM ${avgBpm} bpm dan SpO\u2082 ${avgSpo2}% selama sesi monitoring.`,
        left + 12,
        y + 46,
        { width: contentWidth - 24 }
      );
    doc.y = y + 64 + 18;

    // ── Footer (generated info) ──────────────────────────────────────────────
    // Pastikan tetap dalam batas bawah margin agar tidak membuat halaman baru
    const footerY = doc.page.height - doc.page.margins.bottom - 10;
    doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
      .text(`Dokumen dihasilkan otomatis oleh Sistem Monitoring BPM & SpO\u2082 — ${new Date().toLocaleString('id-ID')}`, left, footerY, { width: contentWidth, align: 'center' });

    doc.end();
    logger.info(`Session PDF exported: session=${sessionId} readings=${readings.length}`);
  } catch (err) {
    next(err);
  }
}
