// =============================================================================
// Dashboard Routes
// =============================================================================

import { Router } from 'express';
import { getDashboard } from './dashboard.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

/**
 * GET /api/v1/dashboard
 * Requires authentication.
 */
router.get('/', authenticate, getDashboard);

export default router;
