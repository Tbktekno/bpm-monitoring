// =============================================================================
// Socket.IO Event Handlers (Admin-Facing Only)
// =============================================================================
// Manages real-time communication between backend and admin frontend clients.
// 
// ESP8266 DEVICE DATA: Now ingested via HTTP POST /api/v1/readings/device
// (see modules/readings/readings.controller.ts)
//
// Namespace: default (/)
//
// Events:
//   monitoring:update      → Broadcast to all connected admin clients (from HTTP controller)
//   monitoring:alert       → Broadcast threshold alerts (from HTTP controller)
//   subscribe:patient      ← Client subscribes to patient room
//   unsubscribe:patient    ← Client unsubscribes from patient room
// =============================================================================

import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../server/middleware/request-logger';
import { JwtPayload } from '../server/middleware/auth';

// ─── Connected clients tracking ──────────────────────────────────────────────
const connectedAdmins = new Map<string, { adminId: number; email: string; name: string }>();

// ─── Socket.IO handler registration ──────────────────────────────────────────

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // ── Authentication via JWT token ───────────────────────────────────────
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    let adminInfo: { adminId: number; email: string; name: string } | null = null;

    if (token && typeof token === 'string') {
      try {
        const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
        adminInfo = { adminId: decoded.adminId, email: decoded.email, name: decoded.email };
        connectedAdmins.set(socket.id, adminInfo);
        socket.join('admins');
        logger.info(`Admin authenticated via socket: ${decoded.email}`);
      } catch {
        logger.warn(`Socket ${socket.id} provided invalid token`);
      }
    }

    // ── Client subscribes to a specific patient ─────────────────────────────
    socket.on('subscribe:patient', (payload: { patientId: number }) => {
      if (!payload || !payload.patientId) {
        socket.emit('error', { message: 'patientId is required' });
        return;
      }
      const room = `patient:${payload.patientId}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} subscribed to ${room}`);
      socket.emit('subscribed', { patientId: payload.patientId });
    });

    // ── Client unsubscribes from a specific patient ─────────────────────────
    socket.on('unsubscribe:patient', (payload: { patientId: number }) => {
      if (!payload || !payload.patientId) {
        socket.emit('error', { message: 'patientId is required' });
        return;
      }
      const room = `patient:${payload.patientId}`;
      socket.leave(room);
      logger.info(`Socket ${socket.id} unsubscribed from ${room}`);
      socket.emit('unsubscribed', { patientId: payload.patientId });
    });

    // ── Disconnect handler ──────────────────────────────────────────────────
    socket.on('disconnect', () => {
      connectedAdmins.delete(socket.id);
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}

// ─── Expose connected admin count for status endpoints ──────────────────────
export function getConnectionStats(): { admins: number } {
  return {
    admins: connectedAdmins.size,
  };
}
