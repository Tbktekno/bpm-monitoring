// =============================================================================
// Monitoring Controller — Real-time & Historical Data
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { ValidationError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

/**
 * GET /api/v1/monitoring
 * Returns all active monitoring data — patients with active sessions + latest readings.
 */
export async function getActiveMonitoring(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activeSessions = await prisma.monitoringSession.findMany({
      where: { status: 'ACTIVE' },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            name: true,
            gender: true,
            age: true,
          },
        },
        readings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            bpm: true,
            spo2: true,
            bpmStatus: true,
            spo2Status: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: { readings: true },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    logger.info(`Active monitoring: ${activeSessions.length} sessions`);

    res.json({
      success: true,
      data: {
        items: activeSessions,
        totalActive: activeSessions.length,
      },
      message: 'Active monitoring data retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/monitoring/realtime
 * Returns the latest reading for each patient who has readings.
 */
export async function getRealtimeData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── 1. Fetch all patients with at least one reading (single query) ─────
    const patients = await prisma.patient.findMany({
      where: {
        readings: {
          some: {}, // has at least one reading
        },
      },
      select: {
        id: true,
        patientId: true,
        name: true,
        gender: true,
        age: true,
      },
    });

    if (patients.length === 0) {
      res.json({
        success: true,
        data: [],
        message: 'Realtime data retrieved',
      });
      return;
    }

    const patientIds = patients.map((p) => p.id);

    // ─── 2. Get latest reading per patient using Prisma aggregation ──────────
    // Step 2a: groupBy to get the max (latest) reading ID per patient.
    const latestReadingIds = await prisma.reading.groupBy({
      by: ['patientId'],
      where: { patientId: { in: patientIds } },
      _max: { id: true },
    });

    const readingIds = latestReadingIds
      .map((r) => r._max.id)
      .filter((id): id is number => id !== null);

    // Step 2b: fetch all latest readings in a single batch query.
    const latestReadings = readingIds.length > 0
      ? await prisma.reading.findMany({
          where: { id: { in: readingIds } },
          select: {
            id: true,
            patientId: true,
            bpm: true,
            spo2: true,
            bpmStatus: true,
            spo2Status: true,
            status: true,
            createdAt: true,
            sessionId: true,
          },
        })
      : [];

    const readingMap = new Map<number, typeof latestReadings[0]>();
    for (const r of latestReadings) {
      if (r.patientId !== null) {
        readingMap.set(r.patientId, r);
      }
    }

    // ─── 3. Get all active sessions in a single batch query ──────────────────
    const activeSessions = await prisma.monitoringSession.findMany({
      where: { patientId: { in: patientIds }, status: 'ACTIVE' },
      select: { id: true, patientId: true, startTime: true },
    });

    const sessionMap = new Map<number, typeof activeSessions[0]>();
    for (const s of activeSessions) {
      sessionMap.set(s.patientId, s);
    }

    // ─── 4. Assemble the response in-memory (no DB calls) ────────────────────
    const realtimeData = patients.map((patient) => {
      const latestReading = readingMap.get(patient.id) ?? null;
      const activeSession = sessionMap.get(patient.id) ?? null;

      return {
        patient,
        latestReading,
        activeSessionId: activeSession?.id ?? null,
        isMonitoring: !!activeSession,
      };
    });

    res.json({
      success: true,
      data: realtimeData,
      message: 'Realtime data retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/monitoring/session/start
 * Memulai sesi monitoring untuk pasien + device tertentu.
 * Semua data dari device akan otomatis tercatat ke pasien ini.
 */
export async function startMonitoringSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { patientId, deviceId } = req.body;

    if (!patientId) {
      res.status(400).json({ success: false, data: null, message: 'patientId wajib diisi' });
      return;
    }

    // Cek apakah sudah ada session ACTIVE untuk device ini
    if (deviceId) {
      const existing = await prisma.monitoringSession.findFirst({
        where: { deviceId, status: 'ACTIVE' },
      });
      if (existing) {
        res.status(409).json({
          success: false,
          data: { sessionId: existing.id },
          message: 'Device ini sedang dalam sesi monitoring aktif',
        });
        return;
      }
    }

    // Validasi pasien
    const patient = await prisma.patient.findUnique({
      where: { id: Number(patientId) },
    });
    if (!patient) {
      res.status(404).json({ success: false, data: null, message: 'Pasien tidak ditemukan' });
      return;
    }

    const session = await prisma.monitoringSession.create({
      data: {
        patientId: Number(patientId),
        deviceId: deviceId || null,
        status: 'ACTIVE',
        startTime: new Date(),
        notes: `Monitoring dimulai untuk ${patient.name}`,
      },
      include: {
        patient: {
          select: { id: true, patientId: true, name: true },
        },
      },
    });

    logger.info(`[SESSION] START: patient=${patient.name} device=${deviceId || '-'} session=${session.id}`);

    res.status(201).json({
      success: true,
      data: session,
      message: 'Sesi monitoring dimulai',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/monitoring/session/stop
 * Mengakhiri sesi monitoring aktif untuk device tertentu.
 */
export async function stopMonitoringSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, deviceId } = req.body;

    let session;

    if (sessionId) {
      session = await prisma.monitoringSession.findUnique({
        where: { id: Number(sessionId) },
        include: { patient: { select: { id: true, patientId: true, name: true } } },
      });
    } else if (deviceId) {
      session = await prisma.monitoringSession.findFirst({
        where: { deviceId, status: 'ACTIVE' },
        include: { patient: { select: { id: true, patientId: true, name: true } } },
      });
    }

    if (!session) {
      res.status(404).json({ success: false, data: null, message: 'Tidak ada sesi monitoring aktif' });
      return;
    }

    const updated = await prisma.monitoringSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
      },
      include: {
        patient: { select: { id: true, patientId: true, name: true } },
        _count: { select: { readings: true } },
      },
    });

    // Update semua reading yang belum punya patientId di sesi ini
    await prisma.reading.updateMany({
      where: { sessionId: session.id, patientId: null },
      data: { patientId: session.patientId },
    });

    logger.info(`[SESSION] STOP: patient=${session.patient.name} session=${session.id} readings=${updated._count.readings}`);

    res.json({
      success: true,
      data: updated,
      message: `Sesi monitoring selesai. Total ${updated._count.readings} data terekam.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/monitoring/sessions
 * Mendapatkan daftar sesi monitoring (untuk laporan).
 */
export async function getMonitoringSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;
    const status = String(req.query.status || '');
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patientId && !isNaN(patientId)) where.patientId = patientId;
    if (status && ['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) where.status = status;

    const [items, total] = await Promise.all([
      prisma.monitoringSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          patient: { select: { id: true, patientId: true, name: true } },
          _count: { select: { readings: true } },
        },
      }),
      prisma.monitoringSession.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      message: 'Monitoring sessions retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/monitoring/session/:sessionId
 * Returns readings for a specific monitoring session.
 */
export async function getSessionReadings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = parseInt(String(req.params.sessionId), 10);
    if (isNaN(sessionId)) {
      res.status(400).json({ success: false, data: null, message: 'Invalid session ID' });
      return;
    }

    const session = await prisma.monitoringSession.findUnique({
      where: { id: sessionId },
      include: {
        patient: { select: { id: true, patientId: true, name: true } },
        readings: {
          orderBy: { createdAt: 'asc' },
          take: 1000,
        },
      },
    });

    if (!session) {
      res.status(404).json({ success: false, data: null, message: 'Session not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          patientId: session.patientId,
          patient: session.patient,
          deviceId: session.deviceId,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
          notes: session.notes,
        },
        readings: session.readings,
        totalReadings: session.readings.length,
      },
      message: 'Session readings retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/monitoring/patient/:patientId
 * Returns readings for a specific patient (for real-time chart).
 */
export async function getPatientReadings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = parseInt(String(req.params.patientId), 10);
    if (isNaN(patientId)) {
      // Try finding by patientId string (e.g., P-001)
      const patientIdStr = String(req.params.patientId);
      const patient = await prisma.patient.findFirst({
        where: { patientId: patientIdStr },
        select: { id: true },
      });
      if (!patient) {
        res.status(404).json({ success: false, data: null, message: 'Pasien tidak ditemukan' });
        return;
      }
      // Use the found patient's DB id
      const readings = await prisma.reading.findMany({
        where: { patientId: patient.id },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200),
        include: {
          patient: {
            select: { id: true, patientId: true, name: true },
          },
        },
      });
      res.json({
        success: true,
        data: {
          readings: readings.reverse(),
          pagination: { page: 1, limit: readings.length, total: readings.length, totalPages: 1 },
        },
        message: 'Patient readings retrieved',
      });
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);
    const readings = await prisma.reading.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        patient: {
          select: { id: true, patientId: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      data: {
        readings: readings.reverse(),
        pagination: { page: 1, limit, total: readings.length, totalPages: 1 },
      },
      message: 'Patient readings retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/monitoring/history
 * Returns reading history with date filters, status filter, and pagination.
 */
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const skip = (page - 1) * limit;

    const startDate = String(req.query.startDate ?? '');
    const endDate = String(req.query.endDate ?? '');
    const status = String(req.query.status ?? '');
    const patientId = String(req.query.patientId ?? '');
    const bpmStatus = String(req.query.bpmStatus ?? '');
    const spo2Status = String(req.query.spo2Status ?? '');

    const where: any = {};

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) {
          where.createdAt.gte = sd;
        }
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) {
          where.createdAt.lte = ed;
        }
      }
    }

    // Status filters
    if (status && ['NORMAL', 'WASPADA', 'DARURAT'].includes(status)) {
      where.status = status;
    }
    if (bpmStatus && ['BRADICARDIA', 'NORMAL', 'TACHY_RINGAN', 'TACHY_BERAT'].includes(bpmStatus)) {
      where.bpmStatus = bpmStatus;
    }
    if (spo2Status && ['NORMAL', 'HIPOKSEMIA_RINGAN', 'HIPOKSEMIA_SEDANG', 'HIPOKSEMIA_BERAT'].includes(spo2Status)) {
      where.spo2Status = spo2Status;
    }

    // Patient filter
    if (patientId) {
      const pid = parseInt(patientId, 10);
      if (!isNaN(pid)) {
        where.patientId = pid;
      } else {
        // Try matching by patientId string (e.g., P-001)
        const patient = await prisma.patient.findFirst({
          where: { patientId },
          select: { id: true },
        });
        if (patient) {
          where.patientId = patient.id;
        } else {
          // No matching patient, return empty
          res.json({
            success: true,
            data: {
              readings: [],  // ⚠ Frontend expects "readings"
              pagination: { page, limit, total: 0, totalPages: 0 },
            },
            message: 'History retrieved',
          });
          return;
        }
      }
    }

    const [items, total] = await Promise.all([
      prisma.reading.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              patientId: true,
              name: true,
              gender: true,
              age: true,
            },
          },
          session: {
            select: {
              id: true,
              status: true,
              startTime: true,
            },
          },
        },
      }),
      prisma.reading.count({ where }),
    ]);

    logger.info(`History: page=${page} limit=${limit} total=${total}`);

    res.json({
      success: true,
      data: {
        readings: items,  // ⚠ Frontend expects "readings", not "items"
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: 'History retrieved',
    });
  } catch (err) {
    next(err);
  }
}
