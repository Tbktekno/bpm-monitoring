// =============================================================================
// Auth Routes
// =============================================================================

import { Router } from 'express';
import { login, logout, me } from './auth.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Body: { email: string, password: string, rememberMe?: boolean }
 */
router.post('/login', login);

/**
 * POST /api/v1/auth/logout
 * Header: Authorization: Bearer <token>
 */
router.post('/logout', authenticate, logout);

/**
 * GET /api/v1/auth/me
 * Header: Authorization: Bearer <token>
 */
router.get('/me', authenticate, me);

export default router;
