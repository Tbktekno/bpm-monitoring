// =============================================================================
// Reports Routes
// =============================================================================

import { Router } from 'express';
import {
  getDailyReport,
  getMonthlyReport,
  exportPdf,
  exportExcel,
  exportSessionPdf,
} from './reports.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

// All report routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/reports/daily
 * Query: startDate, endDate
 */
router.get('/daily', getDailyReport);

/**
 * GET /api/v1/reports/monthly
 * Query: year
 */
router.get('/monthly', getMonthlyReport);

/**
 * GET /api/v1/reports/export/pdf
 * Query: type, startDate, endDate
 */
router.get('/export/pdf', exportPdf);

/**
 * GET /api/v1/reports/export/excel
 * Query: startDate, endDate
 */
router.get('/export/excel', exportExcel);

/**
 * GET /api/v1/reports/export/session-pdf
 * Query: sessionId
 */
router.get('/export/session-pdf', exportSessionPdf);

export default router;
