// =============================================================================
// Readings Controller — ESP8266 Sensor Data Ingestion
// =============================================================================
// Handles HTTP POST from ESP8266 devices to store vital-sign readings and
// broadcast real-time updates to admin frontends via Socket.IO.
//
// Replaces the old Socket.IO `esp32:reading` event handler with an HTTP
// endpoint authenticated via the `esp32HttpAuth` middleware.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../../config/database';
import { calculateStatuses } from '../../shared/status-calculator';
import { logger } from '../../server/middleware/request-logger';
import { ValidationError } from '../../shared/app-error';

// ─── Socket.IO instance (injected at server startup) ─────────────────────────

let _io: SocketIOServer | null = null;

/**
 * Inject the Socket.IO server instance so this controller can broadcast
 * real-time updates to connected admin frontends.
 *
 * Must be called during server initialisation (see server/index.ts) before
 * any incoming reading requests are processed.
 *
 * @param io - The Socket.IO Server instance.
 */
export function setSocketIO(io: SocketIOServer): void {
  _io = io;
}

/**
 * Get the injected Socket.IO server instance.
 *
 * @returns The Socket.IO Server instance.
 * @throws Error if `setSocketIO()` has not been called yet.
 */
function getIO(): SocketIOServer {
  if (!_io) {
    throw new Error('Socket.IO not initialized — call setSocketIO() during server startup');
  }
  return _io;
}

// ─── Threshold cache (refreshed periodically from Setting table) ─────────────

interface Thresholds {
  minBpm: number;
  maxBpm: number;
  minSpo2: number;
  maxSpo2: number;
}

let thresholdCache: Thresholds | null = null;

/** Default thresholds used when the Setting table is unavailable. */
const DEFAULT_THRESHOLDS: Thresholds = {
  minBpm: 60,
  maxBpm: 100,
  minSpo2: 95,
  maxSpo2: 100,
};

/**
 * Refresh the in-memory threshold cache from the `Setting` database table.
 *
 * Settings keys:
 *   - `min_bpm`   : minimum normal BPM (default "60")
 *   - `max_bpm`   : maximum normal BPM (default "100")
 *   - `min_spo2`  : minimum normal SpO₂ % (default "95")
 *   - `max_spo2`  : maximum normal SpO₂ % (default "100")
 *
 * Falls back to `DEFAULT_THRESHOLDS` on any database error.
 */
async function refreshThresholds(): Promise<void> {
  try {
    const settings = await prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    thresholdCache = {
      minBpm: parseInt(map['min_bpm'] || String(DEFAULT_THRESHOLDS.minBpm), 10),
      maxBpm: parseInt(map['max_bpm'] || String(DEFAULT_THRESHOLDS.maxBpm), 10),
      minSpo2: parseInt(map['min_spo2'] || String(DEFAULT_THRESHOLDS.minSpo2), 10),
      maxSpo2: parseInt(map['max_spo2'] || String(DEFAULT_THRESHOLDS.maxSpo2), 10),
    };
  } catch (err) {
    logger.error('[READINGS] Failed to refresh threshold cache, using defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
    thresholdCache = { ...DEFAULT_THRESHOLDS };
  }
}

/**
 * Check whether the given vital-sign values exceed any alert threshold.
 *
 * @param bpm  - Beats-per-minute value to check.
 * @param spo2 - SpO₂ percentage value to check.
 * @returns An object with `isAlert` flag and a human-readable `reason`
 *          string (or `null` when within normal bounds).
 */
function isAlertThreshold(bpm: number, spo2: number): { isAlert: boolean; reason: string | null } {
  const t = thresholdCache || DEFAULT_THRESHOLDS;
  if (bpm < t.minBpm) return { isAlert: true, reason: `BPM ${bpm} di bawah batas normal (${t.minBpm})` };
  if (bpm > t.maxBpm) return { isAlert: true, reason: `BPM ${bpm} di atas batas normal (${t.maxBpm})` };
  if (spo2 < t.minSpo2) return { isAlert: true, reason: `SpO₂ ${spo2}% di bawah batas normal (${t.minSpo2}%)` };
  return { isAlert: false, reason: null };
}

/**
 * Initialise the threshold cache.
 *
 * - Refreshes immediately on first call (used at server startup).
 * - Schedules a periodic refresh every 5 minutes.
 *
 * Safe to call multiple times; subsequent calls are idempotent and will not
 * create duplicate intervals.
 */
let _initialised = false;

export function initThresholdCache(): void {
  if (_initialised) return;
  _initialised = true;

  refreshThresholds();
  setInterval(refreshThresholds, 5 * 60 * 1000);
  logger.info('[READINGS] Threshold cache initialised (refresh every 5 min)');
}

// ─── Request body validation ─────────────────────────────────────────────────

interface CreateReadingBody {
  bpm: number;
  spo2: number;
}

/**
 * Validate and sanitise the incoming reading request body.
 *
 * @param body - The raw request body (untrusted).
 * @returns A validated `CreateReadingBody`.
 * @throws ValidationError if any field is missing, wrong type, or out of range.
 */
function validateReadingBody(body: Record<string, unknown>): CreateReadingBody {
  const errors: Record<string, string> = {};

  // ── bpm ─────────────────────────────────────────────────────────────────
  const bpm = body.bpm;
  if (bpm == null) {
    errors.bpm = 'BPM wajib diisi';
  } else if (typeof bpm !== 'number' || !Number.isFinite(bpm)) {
    errors.bpm = 'BPM harus berupa angka';
  } else if (!Number.isInteger(bpm)) {
    errors.bpm = 'BPM harus berupa bilangan bulat';
  } else if (bpm < 30 || bpm > 250) {
    errors.bpm = 'BPM harus antara 30–250';
  }

  // ── spo2 ────────────────────────────────────────────────────────────────
  const spo2 = body.spo2;
  if (spo2 == null) {
    errors.spo2 = 'SpO₂ wajib diisi';
  } else if (typeof spo2 !== 'number' || !Number.isFinite(spo2)) {
    errors.spo2 = 'SpO₂ harus berupa angka';
  } else if (!Number.isInteger(spo2)) {
    errors.spo2 = 'SpO₂ harus berupa bilangan bulat';
  } else if (spo2 < 50 || spo2 > 100) {
    errors.spo2 = 'SpO₂ harus antara 50–100';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validasi reading gagal', errors);
  }

  return { bpm: bpm as number, spo2: spo2 as number };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/readings/device
 *
 * Receive and store a sensor reading from an authenticated ESP8266 device.
 *
 * Middleware requirements (applied via `readings.routes.ts`):
 *   1. `esp32HttpAuth` — validates device API key from headers and attaches
 *      `{ deviceId, label }` to `req.device`.
 *
 * Request body:
 *   ```json
 *   { "bpm": 72, "spo2": 98 }
 *   ```
 *
 * Processing flow:
 *   1. Validate body fields and ranges.
 *   2. Look up an active `MonitoringSession` for the device's `deviceId`.
 *   3. If found, associate the reading with the session's `patientId`.
 *   4. Compute BPM status, SpO₂ status, and composite status.
 *   5. Persist the reading to the database via Prisma.
 *   6. Broadcast `monitoring:update` to the `admins` Socket.IO room.
 *   7. If thresholds are exceeded or status is not `NORMAL`, also emit
 *      `monitoring:alert`.
 *   8. Return a success response to the device.
 *
 * @param req  - Express Request with `req.device` populated by auth middleware.
 * @param res  - Express Response.
 * @param next - Express NextFunction for error forwarding.
 */
export async function createReading(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // ── 1. Validate body ──────────────────────────────────────────────────
    const { bpm, spo2 } = validateReadingBody(req.body as Record<string, unknown>);

    // ── 2. Resolve device identity ────────────────────────────────────────
    // Device is guaranteed to be authenticated by esp32HttpAuth middleware.
    const device = req.device;
    if (!device) {
      // Safety guard — should never happen if routes are correctly configured.
      throw new ValidationError('Device not authenticated');
    }

    // ── 3. Find active monitoring session for this device ─────────────────
    // If an admin has started a monitoring session for this device, the
    // reading is automatically linked to the session's patient.
    let activeSessionId: number | null = null;
    let assignedPatientId: number | null = null;

    const activeSession = await prisma.monitoringSession.findFirst({
      where: { deviceId: device.deviceId, status: 'ACTIVE' },
      select: { id: true, patientId: true },
    });

    if (activeSession) {
      activeSessionId = activeSession.id;
      assignedPatientId = activeSession.patientId;
    }

    // ── 4. Compute statuses ───────────────────────────────────────────────
    const { bpmStatus, spo2Status, status } = calculateStatuses(bpm, spo2);

    // ── 5. Persist reading ────────────────────────────────────────────────
    const reading = await prisma.reading.create({
      data: {
        patientId: assignedPatientId,
        sessionId: activeSessionId,
        bpm,
        spo2,
        bpmStatus,
        spo2Status,
        status,
      },
      include: {
        patient: {
          select: { id: true, patientId: true, name: true },
        },
      },
    });

    logger.info('[READINGS] Data tersimpan', {
      deviceId: device.deviceId,
      bpm,
      spo2,
      status,
      sessionId: activeSessionId,
      patientId: assignedPatientId,
      readingId: reading.id,
    });

    // ── 6. Broadcast to admin frontends via Socket.IO ─────────────────────
    try {
      const io = getIO();

      // Emit monitoring:update to all admins
      io.to('admins').emit('monitoring:update', {
        type: 'new_reading',
        reading,
        deviceId: device.deviceId,
        deviceLabel: device.label,
      });

      // Check alert thresholds and emit alert if needed
      const alertCheck = isAlertThreshold(bpm, spo2);
      if (alertCheck.isAlert || status !== 'NORMAL') {
        io.to('admins').emit('monitoring:alert', {
          deviceId: device.deviceId,
          deviceLabel: device.label,
          reading: {
            id: reading.id,
            bpm,
            spo2,
            bpmStatus,
            spo2Status,
            status,
            createdAt: reading.createdAt,
          },
          message: alertCheck.reason || `Status: ${status}`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      // Socket.IO broadcast failure should not block the response.
      // Log the error and continue — the reading has already been saved.
      logger.error('[READINGS] Failed to broadcast via Socket.IO', {
        error: socketErr instanceof Error ? socketErr.message : String(socketErr),
        readingId: reading.id,
      });
    }

    // ── 7. Respond to device ──────────────────────────────────────────────
    res.status(201).json({
      success: true,
      data: {
        readingId: reading.id,
        status,
      },
      message: 'Data tersimpan',
    });
  } catch (err) {
    next(err);
  }
}
