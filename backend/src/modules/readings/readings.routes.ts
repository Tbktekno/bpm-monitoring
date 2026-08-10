import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createReading } from './readings.controller';
import { esp32HttpAuth } from '../../shared/esp32-http-auth';
import { esp32RateLimit } from '../../config/security';

const router = Router();

/**
 * Dedicated rate limiter untuk pengiriman data sensor.
 *
 * Tanpa ini, endpoint `/api/v1/readings/device` tunduk pada global rate limit
 * (default 200 request / 15 menit per IP) yang sangat mudah ditembus ESP8266
 * yang mengirim data setiap ±3 detik (20/menit). Ketika limit tercapai,
 * express-rate-limit mengembalikan 429 dan — karena limiter berjalan SEBELUM
 * request logger — request tersebut tidak muncul di log sama sekali, sehingga
 * terlihat seperti "backend berhenti menerima data padahal sebenarnya ditolak".
 *
 * ESP device rate limit: default 60 request / 1 menit per IP device
 * (lihat config/security.ts → esp32RateLimit → env `RATE_LIMIT_ESP32_MAX`).
 */
const deviceRateLimiter = rateLimit(esp32RateLimit);

/**
 * POST /api/v1/readings/device
 * Menerima data sensor dari ESP8266 (authenticated via API key headers).
 * Body: { bpm: number, spo2: number }
 */
router.post('/device', deviceRateLimiter, esp32HttpAuth(), createReading);

export default router;
