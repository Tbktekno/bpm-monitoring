// =============================================================================
// AuthService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements Login, Logout, and GetCurrentAdmin RPCs.
// Uses in-memory session store for token management.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

// ─── In-memory session store ────────────────────────────────────────────────
// Maps token -> adminId. In production, replace with Redis or JWT.
const sessions = new Map<string, number>();

export function createAuthHandlers(prisma: PrismaClient) {
  return {

    // ─── Login ──────────────────────────────────────────────────────────────
    Login: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { email, password } = call.request;

        if (!email || !password) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Email and password are required',
          });
        }

        const admin = await prisma.admin.findUnique({
          where: { email },
        });

        if (!admin) {
          return callback({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid email or password',
          });
        }

        const passwordValid = await bcrypt.compare(password, admin.passwordHash);
        if (!passwordValid) {
          return callback({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Invalid email or password',
          });
        }

        // Generate session token
        const token = crypto.randomBytes(48).toString('hex');
        sessions.set(token, admin.id);

        callback(null, {
          admin_id: admin.id,
          name: admin.name,
          email: admin.email,
          token,
        });
      } catch (error) {
        console.error('[AuthService.Login]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── Logout ──────────────────────────────────────────────────────────────
    Logout: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { token } = call.request;

        if (token) {
          sessions.delete(token);
        }

        callback(null, {});
      } catch (error) {
        console.error('[AuthService.Logout]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── GetCurrentAdmin ────────────────────────────────────────────────────
    GetCurrentAdmin: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { admin_id } = call.request;

        if (!admin_id) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'Admin ID is required',
          });
        }

        const admin = await prisma.admin.findUnique({
          where: { id: admin_id },
        });

        if (!admin) {
          return callback({
            code: grpc.status.NOT_FOUND,
            message: 'Admin not found',
          });
        }

        callback(null, {
          admin_id: admin.id,
          name: admin.name,
          email: admin.email,
          created_at: admin.createdAt.toISOString(),
        });
      } catch (error) {
        console.error('[AuthService.GetCurrentAdmin]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}

export function validateToken(token: string): number | null {
  return sessions.get(token) ?? null;
}
