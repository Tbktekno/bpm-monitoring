// =============================================================================
// Settings Routes
// =============================================================================

import { Router } from 'express';
import { getSettings, updateSettings, updateProfile, updateThresholds, changePassword, clearMonitoringData } from './settings.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

// All settings routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/settings
 * Returns all settings as key-value pairs.
 */
router.get('/', getSettings);

/**
 * PUT /api/v1/settings
 * Body: { "key": "value", ... }
 * Updates multiple settings at once.
 */
router.put('/', updateSettings);

/**
 * PUT /api/v1/settings/profile
 * Body: { name: string, email: string }
 * Updates admin name and email.
 */
router.put('/profile', updateProfile);

/**
 * PUT /api/v1/settings/thresholds
 * Body: { minBpm: number, maxBpm: number, minSpo2: number, maxSpo2: number }
 * Updates BPM and SpO₂ threshold settings.
 */
router.put('/thresholds', updateThresholds);

/**
 * PUT /api/v1/settings/password
 * Body: { currentPassword: string, newPassword: string, confirmPassword: string }
 * Changes the admin's password.
 */
router.put('/password', changePassword);

/**
 * DELETE /api/v1/settings/data
 * Menghapus semua data monitoring (readings, sessions, audit logs)
 * TANPA menghapus device dan akun admin.
 */
router.delete('/data', clearMonitoringData);

export default router;
