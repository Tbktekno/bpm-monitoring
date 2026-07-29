// =============================================================================
// Devices Routes — ESP32/ESP8266 Device Management CRUD
// =============================================================================

import { Router } from 'express';
import {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  toggleDevice,
} from './devices.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

// All device routes require admin authentication
router.use(authenticate);

/**
 * GET /api/v1/devices
 * Query: ?page=1&limit=10&search=
 */
router.get('/', listDevices);

/**
 * GET /api/v1/devices/:id
 */
router.get('/:id', getDevice);

/**
 * POST /api/v1/devices
 * Body: { deviceId, label?, isActive? }
 * Response: includes rawApiKey (shown only once)
 */
router.post('/', createDevice);

/**
 * PUT /api/v1/devices/:id
 * Body: { deviceId?, label?, isActive? }
 */
router.put('/:id', updateDevice);

/**
 * PATCH /api/v1/devices/:id/toggle
 * Toggle isActive status
 */
router.patch('/:id/toggle', toggleDevice);

/**
 * DELETE /api/v1/devices/:id
 */
router.delete('/:id', deleteDevice);

export default router;
