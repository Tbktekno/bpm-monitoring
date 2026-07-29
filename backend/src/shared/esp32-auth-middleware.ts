// =============================================================================
// ESP32 Auth Middleware — Socket.IO Device Authentication
// =============================================================================
// Authenticates ESP32 / IoT device connections via an API key sent during
// the Socket.IO handshake. The key is SHA-256 hashed and matched against the
// `Esp32Device` table in the database.
//
// Usage:
//   import { Server } from 'socket.io';
//   import { esp32SocketAuthMiddleware } from '../shared/esp32-auth-middleware';
//
//   const io = new Server(httpServer);
//   io.use(esp32SocketAuthMiddleware);
// =============================================================================

import type { Socket } from 'socket.io';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';

// ─── Constants ───────────────────────────────────────────────────────────────

const API_KEY_MIN_LENGTH = 16;
const API_KEY_MAX_LENGTH = 256;

/**
 * Compute SHA-256 hex digest of the raw API key.
 * The database stores the hash, never the plaintext key.
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Socket.IO middleware for authenticating ESP32 devices.
 *
 * MIDDLEWARE LOGIC:
 *   1. Jika koneksi memiliki JWT token (admin frontend) → lewati, next()
 *   2. Jika koneksi memiliki apiKey (ESP32 device) → validasi
 *   3. Jika tidak memiliki keduanya → tolak
 *
 * The ESP32 must supply its API key via query parameter `?apiKey=...`
 * (karena library WebSocketsClient tidak support auth handshake).
 *
 * On success:
 *   - `socket.data.role`       = `'device'`
 *   - `socket.data.deviceId`   = the device's unique identifier from the DB
 *   - `socket.data.deviceLabel`= human-readable label (may be null)
 *   - Middleware calls `next()` with no arguments.
 *
 * On failure:
 *   - Middleware calls `next(new Error('...'))` with a descriptive message.
 */
export async function esp32SocketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    // ── Cek 1: Apakah ini admin frontend (punya JWT token)? ─────────────
    const token: unknown =
      socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        jwt.verify(token, env.jwtSecret);
        // Token valid — ini admin, lewati middleware
        next();
        return;
      } catch {
        // Token tidak valid — jangan lewati, lanjut cek apiKey
      }
    }

    // ── Cek 2: Apakah ini ESP32 device (punya apiKey)? ─────────────────
    const apiKey: unknown =
      socket.handshake.auth?.apiKey ?? socket.handshake.query?.apiKey;

    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      next(new Error('Authentication required (token or API key)'));
      return;
    }

    if (apiKey.length < API_KEY_MIN_LENGTH || apiKey.length > API_KEY_MAX_LENGTH) {
      next(new Error('Invalid API key format'));
      return;
    }

    const apiKeyHash: string = hashApiKey(apiKey);

    const device = await prisma.esp32Device.findFirst({
      where: {
        apiKey: apiKeyHash,
        isActive: true,
      },
      select: {
        deviceId: true,
        label: true,
      },
    });

    if (!device) {
      next(new Error('Authentication failed'));
      return;
    }

    // ── 3. Device terautentikasi ────────────────────────────────────────
    socket.data.role = 'device';
    socket.data.deviceId = device.deviceId;
    socket.data.deviceLabel = device.label ?? null;

    next();
  } catch (error: unknown) {
    console.error('[esp32SocketAuthMiddleware] Internal error:', error);
    next(new Error('Authentication service unavailable'));
  }
}
