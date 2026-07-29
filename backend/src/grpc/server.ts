// =============================================================================
// gRPC Server — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Loads the proto definition at runtime, creates a gRPC server,
// registers all 6 service implementations, and binds to port 50051.
// =============================================================================

import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { PrismaClient } from '@prisma/client';

import {
  createAuthHandlers,
  createDashboardHandlers,
  createPatientHandlers,
  createMonitoringHandlers,
  createReportHandlers,
  createSettingsHandlers,
} from './handlers';

// ─── Constants ──────────────────────────────────────────────────────────────
const PROTO_PATH = path.resolve(__dirname, '..', '..', 'proto', 'monitoring.proto');
const GRPC_HOST = process.env.GRPC_HOST || '0.0.0.0';
const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);

// ─── Proto loader options ───────────────────────────────────────────────────
const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: false,             // Convert snake_case to camelCase in JS
  longs: Number,               // Represent int64/int64 as numbers
  enums: String,               // Represent enums as strings
  defaults: true,              // Set default values for missing fields
  oneofs: true,                // Treat oneof fields as objects
};

// ─── Server state ───────────────────────────────────────────────────────────
let grpcServer: grpc.Server | null = null;

// ─── Start the gRPC server ──────────────────────────────────────────────────
export async function startGrpcServer(prisma: PrismaClient): Promise<{
  server: grpc.Server;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    try {
      // ── 1. Load proto definition ─────────────────────────────────────────
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, PROTO_OPTIONS);
      const proto = grpc.loadPackageDefinition(packageDefinition) as any;

      if (!proto.monitoring) {
        throw new Error(
          'Package "monitoring" not found in proto definition. ' +
          'Ensure the proto file contains "package monitoring;"',
        );
      }

      // ── 2. Create gRPC server ───────────────────────────────────────────
      grpcServer = new grpc.Server({
        'grpc.max_receive_message_length': 1024 * 1024 * 10,  // 10 MB
        'grpc.max_send_message_length': 1024 * 1024 * 10,     // 10 MB
      });

      // ── 3. Register all services ─────────────────────────────────────────
      grpcServer.addService(
        proto.monitoring.AuthService.service,
        createAuthHandlers(prisma),
      );

      grpcServer.addService(
        proto.monitoring.DashboardService.service,
        createDashboardHandlers(prisma),
      );

      grpcServer.addService(
        proto.monitoring.PatientService.service,
        createPatientHandlers(prisma),
      );

      grpcServer.addService(
        proto.monitoring.MonitoringService.service,
        createMonitoringHandlers(prisma),
      );

      grpcServer.addService(
        proto.monitoring.ReportService.service,
        createReportHandlers(prisma),
      );

      grpcServer.addService(
        proto.monitoring.SettingsService.service,
        createSettingsHandlers(prisma),
      );

      // ── 4. Bind and start ────────────────────────────────────────────────
      const address = `${GRPC_HOST}:${GRPC_PORT}`;
      grpcServer.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            return reject(error);
          }

          grpcServer!.start();
          console.log(`[gRPC] Server started on ${address} (port ${boundPort})`);
          console.log(`[gRPC] Proto loaded from: ${PROTO_PATH}`);
          console.log(`[gRPC] Services registered:`);
          console.log(`       • AuthService          (Login, Logout, GetCurrentAdmin)`);
          console.log(`       • DashboardService     (GetDashboardStats)`);
          console.log(`       • PatientService       (CRUD: List, Get, Create, Update, Delete)`);
          console.log(`       • MonitoringService    (Realtime, History, SaveReading)`);
          console.log(`       • ReportService        (Daily, Monthly, Export)`);
          console.log(`       • SettingsService      (Get, Update)`);

          resolve({ server: grpcServer!, port: boundPort });
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────
export async function stopGrpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (grpcServer) {
      console.log('[gRPC] Shutting down server …');
      grpcServer.tryShutdown(() => {
        console.log('[gRPC] Server stopped');
        grpcServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
