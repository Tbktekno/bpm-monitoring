// =============================================================================
// gRPC Client — BPM & SpO₂ Monitoring Dashboard
// =============================================================================
// Provides a typed client factory for Express controllers to call
// the gRPC service layer programmatically.
// =============================================================================

import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// ─── Constants ──────────────────────────────────────────────────────────────
const PROTO_PATH = path.resolve(__dirname, '..', '..', 'proto', 'monitoring.proto');
const GRPC_TARGET = process.env.GRPC_HOST
  ? `${process.env.GRPC_HOST}:${process.env.GRPC_PORT || '50051'}`
  : 'localhost:50051';

const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
};

// ─── Proto definition (loaded once) ─────────────────────────────────────────
const packageDefinition = protoLoader.loadSync(PROTO_PATH, PROTO_OPTIONS);
const proto = grpc.loadPackageDefinition(packageDefinition) as any;

// ─── gRPC Service Clients ───────────────────────────────────────────────────

export interface GrpcClients {
  auth: grpc.Client;
  dashboard: grpc.Client;
  patient: grpc.Client;
  monitoring: grpc.Client;
  report: grpc.Client;
  settings: grpc.Client;
}

let clients: GrpcClients | null = null;

// ─── Create all gRPC clients ────────────────────────────────────────────────
export function createGrpcClients(): GrpcClients {
  if (clients) return clients;

  const credentials = grpc.credentials.createInsecure();

  clients = {
    auth: new proto.monitoring.AuthService(GRPC_TARGET, credentials),
    dashboard: new proto.monitoring.DashboardService(GRPC_TARGET, credentials),
    patient: new proto.monitoring.PatientService(GRPC_TARGET, credentials),
    monitoring: new proto.monitoring.MonitoringService(GRPC_TARGET, credentials),
    report: new proto.monitoring.ReportService(GRPC_TARGET, credentials),
    settings: new proto.monitoring.SettingsService(GRPC_TARGET, credentials),
  };

  return clients;
}

// ─── Close all gRPC clients ─────────────────────────────────────────────────
export function closeGrpcClients(): void {
  if (clients) {
    for (const [name, client] of Object.entries(clients)) {
      client.close();
    }
    clients = null;
  }
}

// ─── Unary RPC helper (promisified) ─────────────────────────────────────────
export function grpcCall<TReq, TRes>(
  client: grpc.Client,
  method: string,
  request: TReq,
  metadata?: grpc.Metadata,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const meta = metadata ?? new grpc.Metadata();
    (client as any)[method](request, meta, (error: grpc.ServiceError | null, response: TRes) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

// ─── Typed interfaces for each service ──────────────────────────────────────

export interface IAuthServiceClient {
  login(req: any, meta?: grpc.Metadata): Promise<any>;
  logout(req: any, meta?: grpc.Metadata): Promise<any>;
  getCurrentAdmin(req: any, meta?: grpc.Metadata): Promise<any>;
}

export interface IDashboardServiceClient {
  getDashboardStats(req: any, meta?: grpc.Metadata): Promise<any>;
}

export interface IPatientServiceClient {
  listPatients(req: any, meta?: grpc.Metadata): Promise<any>;
  getPatient(req: any, meta?: grpc.Metadata): Promise<any>;
  createPatient(req: any, meta?: grpc.Metadata): Promise<any>;
  updatePatient(req: any, meta?: grpc.Metadata): Promise<any>;
  deletePatient(req: any, meta?: grpc.Metadata): Promise<any>;
}

export interface IMonitoringServiceClient {
  getRealtimeMonitoring(req: any, meta?: grpc.Metadata): Promise<any>;
  getMonitoringHistory(req: any, meta?: grpc.Metadata): Promise<any>;
  saveReading(req: any, meta?: grpc.Metadata): Promise<any>;
}

export interface IReportServiceClient {
  getDailyReport(req: any, meta?: grpc.Metadata): Promise<any>;
  getMonthlyReport(req: any, meta?: grpc.Metadata): Promise<any>;
  exportReport(req: any, meta?: grpc.Metadata): Promise<any>;
}

export interface ISettingsServiceClient {
  getSettings(req: any, meta?: grpc.Metadata): Promise<any>;
  updateSettings(req: any, meta?: grpc.Metadata): Promise<any>;
}

// ─── Convenience functions for Express controllers ──────────────────────────

export function createAuthClient(): IAuthServiceClient {
  const c = createGrpcClients().auth;
  return {
    login: (req, meta?) => grpcCall(c, 'login', req, meta),
    logout: (req, meta?) => grpcCall(c, 'logout', req, meta),
    getCurrentAdmin: (req, meta?) => grpcCall(c, 'getCurrentAdmin', req, meta),
  };
}

export function createDashboardClient(): IDashboardServiceClient {
  const c = createGrpcClients().dashboard;
  return {
    getDashboardStats: (req, meta?) => grpcCall(c, 'getDashboardStats', req, meta),
  };
}

export function createPatientClient(): IPatientServiceClient {
  const c = createGrpcClients().patient;
  return {
    listPatients: (req, meta?) => grpcCall(c, 'listPatients', req, meta),
    getPatient: (req, meta?) => grpcCall(c, 'getPatient', req, meta),
    createPatient: (req, meta?) => grpcCall(c, 'createPatient', req, meta),
    updatePatient: (req, meta?) => grpcCall(c, 'updatePatient', req, meta),
    deletePatient: (req, meta?) => grpcCall(c, 'deletePatient', req, meta),
  };
}

export function createMonitoringClient(): IMonitoringServiceClient {
  const c = createGrpcClients().monitoring;
  return {
    getRealtimeMonitoring: (req, meta?) => grpcCall(c, 'getRealtimeMonitoring', req, meta),
    getMonitoringHistory: (req, meta?) => grpcCall(c, 'getMonitoringHistory', req, meta),
    saveReading: (req, meta?) => grpcCall(c, 'saveReading', req, meta),
  };
}

export function createReportClient(): IReportServiceClient {
  const c = createGrpcClients().report;
  return {
    getDailyReport: (req, meta?) => grpcCall(c, 'getDailyReport', req, meta),
    getMonthlyReport: (req, meta?) => grpcCall(c, 'getMonthlyReport', req, meta),
    exportReport: (req, meta?) => grpcCall(c, 'exportReport', req, meta),
  };
}

export function createSettingsClient(): ISettingsServiceClient {
  const c = createGrpcClients().settings;
  return {
    getSettings: (req, meta?) => grpcCall(c, 'getSettings', req, meta),
    updateSettings: (req, meta?) => grpcCall(c, 'updateSettings', req, meta),
  };
}
