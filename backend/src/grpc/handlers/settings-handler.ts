// =============================================================================
// SettingsService gRPC Handler — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Implements GetSettings and UpdateSettings RPCs.
// Settings are stored as key-value pairs in the database.
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import { PrismaClient } from '@prisma/client';

// ─── Format a Setting record to gRPC shape ───────────────────────────────────
function formatSetting(s: any): any {
  return {
    id: s.id,
    key: s.key,
    value: s.value,
    description: s.description ?? '',
    updated_at: s.updatedAt instanceof Date
      ? s.updatedAt.toISOString()
      : String(s.updatedAt ?? ''),
  };
}

export function createSettingsHandlers(prisma: PrismaClient) {
  return {

    // ─── GetSettings ───────────────────────────────────────────────────────
    GetSettings: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const settings = await prisma.setting.findMany({
          orderBy: { key: 'asc' },
        });

        callback(null, {
          settings: settings.map(formatSetting),
        });
      } catch (error) {
        console.error('[SettingsService.GetSettings]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },

    // ─── UpdateSettings ────────────────────────────────────────────────────
    UpdateSettings: async (
      call: grpc.ServerUnaryCall<any, any>,
      callback: grpc.sendUnaryData<any>,
    ): Promise<void> => {
      try {
        const { settings } = call.request;

        if (!settings || settings.length === 0) {
          return callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'At least one setting must be provided',
          });
        }

        // Upsert each setting
        await prisma.$transaction(
          settings.map((s: any) =>
            prisma.setting.upsert({
              where: { key: s.key },
              update: { value: s.value, description: s.description ?? undefined },
              create: {
                key: s.key,
                value: s.value,
                description: s.description ?? null,
              },
            }),
          ),
        );

        // Return updated settings
        const updated = await prisma.setting.findMany({
          orderBy: { key: 'asc' },
        });

        callback(null, {
          settings: updated.map(formatSetting),
        });
      } catch (error) {
        console.error('[SettingsService.UpdateSettings]', error);
        callback({
          code: grpc.status.INTERNAL,
          message: 'Internal server error',
        });
      }
    },
  };
}
