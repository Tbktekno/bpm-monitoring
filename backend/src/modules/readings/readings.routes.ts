import { Router } from 'express';
import { createReading } from './readings.controller';
import { esp32HttpAuth } from '../../shared/esp32-http-auth';

const router = Router();

/**
 * POST /api/v1/readings/device
 * Menerima data sensor dari ESP8266 (authenticated via API key headers).
 * Body: { bpm: number, spo2: number }
 */
router.post('/device', esp32HttpAuth(), createReading);

export default router;
