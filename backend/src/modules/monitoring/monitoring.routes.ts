// =============================================================================
// Monitoring Routes
// =============================================================================

import { Router } from 'express';
import {
  getActiveMonitoring,
  getRealtimeData,
  getPatientReadings,
  getHistory,
  startMonitoringSession,
  stopMonitoringSession,
  getMonitoringSessions,
  getSessionReadings,
} from './monitoring.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

// All monitoring routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/monitoring
 * Returns all active monitoring sessions with latest readings.
 */
router.get('/', getActiveMonitoring);

/**
 * GET /api/v1/monitoring/realtime
 * Returns latest reading per patient.
 */
router.get('/realtime', getRealtimeData);

/**
 * POST /api/v1/monitoring/session/start
 * Memulai sesi monitoring untuk pasien.
 */
router.post('/session/start', startMonitoringSession);

/**
 * POST /api/v1/monitoring/session/stop
 * Mengakhiri sesi monitoring.
 */
router.post('/session/stop', stopMonitoringSession);

/**
 * GET /api/v1/monitoring/sessions
 * Daftar sesi monitoring (untuk laporan).
 */
router.get('/sessions', getMonitoringSessions);

/**
 * GET /api/v1/monitoring/session/:sessionId
 * Returns readings for a specific monitoring session.
 */
router.get('/session/:sessionId', getSessionReadings);

/**
 * GET /api/v1/monitoring/patient/:patientId
 * Returns readings for a specific patient (for real-time chart).
 */
router.get('/patient/:patientId', getPatientReadings);

/**
 * GET /api/v1/monitoring/history
 * Query: page, limit, startDate, endDate, status, patientId, bpmStatus, spo2Status
 */
router.get('/history', getHistory);

export default router;
