// =============================================================================
// ESP32 HTTP Auth Middleware — Express Header-Based Device Authentication
// =============================================================================
// Authenticates ESP8266 / ESP32 IoT devices via HTTP headers `x-api-key` and
// `x-device-id`. The API key is SHA-256 hashed and matched against the
// `Esp32Device` table in the database.
//
// This replaces the old Socket.IO-based auth for HTTP endpoints. The socket
// middleware (`esp32-auth-middleware.ts`) remains for WebSocket connections.
//
// Usage:
//   import { esp32HttpAuth } from '../shared/esp32-http-auth';
//
//   router.get('/api/data', esp32HttpAuth(), DataController.list);
//
//   // If router-level .use():
//   router.use('/api/device', esp32HttpAuth());
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/database';
import { logger } from '../server/middleware/request-logger';

// ─── Augment Express Request ─────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated ESP32/ESP8266 device context.
       * `undefined` when no HTTP auth middleware has run.
       */
      device?: {
        deviceId: string;
        label: string | null;
      };
    }
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum length for a raw API key provided in the request header. */
const API_KEY_MIN_LENGTH = 16;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hex digest of the raw API key.
 * The database stores the hash, never the plaintext key.
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

// ─── Error response ──────────────────────────────────────────────────────────

interface ErrorResponseBody {
  error: {
    message: string;
    code: string;
  };
}

/**
 * Send a JSON error response with the given status code, message, and
 * machine-readable error code.
 */
function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: string,
): void {
  const body: ErrorResponseBody = { error: { message, code } };
  res.status(statusCode).json(body);
}

// ─── Middleware factory ──────────────────────────────────────────────────────

/**
 * Create an Express middleware that authenticates ESP8266/ESP32 devices via
 * HTTP request headers.
 *
 * Expected headers:
 *   - `x-device-id` : The unique device identifier (string)
 *   - `x-api-key`   : The device's plaintext API key (min 16 characters)
 *
 * Flow:
 *   1. Extract `x-device-id` and `x-api-key` from request headers.
 *   2. Validate that both are present and the key meets minimum length.
 *   3. SHA-256 hash the API key.
 *   4. Query `Esp32Device` table for a match (deviceId + apiKeyHash + isActive).
 *   5. On success: attach `{ deviceId, label }` to `req.device` and call `next()`.
 *   6. On failure: respond 401 with a JSON error body.
 *   7. On unexpected error: respond 500 and log the internal details.
 *
 * @returns An Express middleware function.
 */
export function esp32HttpAuth(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // ── 1. Extract headers ────────────────────────────────────────────────
      const deviceId: string | string[] | undefined = req.headers['x-device-id'];
      const apiKey: string | string[] | undefined = req.headers['x-api-key'];

      // ── 2. Validate deviceId ──────────────────────────────────────────────
      if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
        sendError(res, 401, 'Missing or invalid x-device-id header', 'MISSING_DEVICE_ID');
        return;
      }

      // ── 3. Validate apiKey ────────────────────────────────────────────────
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
        sendError(res, 401, 'Missing or invalid x-api-key header', 'MISSING_API_KEY');
        return;
      }

      if (apiKey.length < API_KEY_MIN_LENGTH) {
        sendError(res, 401, 'Invalid API key format', 'INVALID_API_KEY');
        return;
      }

      // ── 4. Hash the API key ───────────────────────────────────────────────
      const apiKeyHash: string = hashApiKey(apiKey);

      // ── 5. Query database ─────────────────────────────────────────────────
      const device = await prisma.esp32Device.findFirst({
        where: {
          deviceId: deviceId.trim(),
          apiKey: apiKeyHash,
          isActive: true,
        },
        select: {
          deviceId: true,
          label: true,
        },
      });

      // ── 6. Check result ───────────────────────────────────────────────────
      if (!device) {
        logger.warn('ESP32 HTTP auth rejected', {
          deviceId: deviceId.trim(),
          ip: req.ip,
        });
        sendError(res, 401, 'Authentication failed', 'AUTH_FAILED');
        return;
      }

      // ── 7. Attach to request and continue ─────────────────────────────────
      req.device = {
        deviceId: device.deviceId,
        label: device.label ?? null,
      };

      next();
    } catch (error: unknown) {
      logger.error('ESP32 HTTP auth internal error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      sendError(res, 500, 'Authentication service unavailable', 'AUTH_UNAVAILABLE');
    }
  };
}
