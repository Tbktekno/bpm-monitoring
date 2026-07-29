// =============================================================================
// Express Server Setup
// =============================================================================

import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env';
import { corsOptions, helmetConfig, globalRateLimit, authRateLimit } from '../config/security';
import { requestLogger } from './middleware/request-logger';
import { globalErrorHandler } from './middleware/error-handler';
import { registerSocketHandlers } from '../socket/handler';
import { esp32SocketAuthMiddleware } from '../shared/esp32-auth-middleware';
import { logger } from './middleware/request-logger';

// ─── Route imports ───────────────────────────────────────────────────────────
import authRoutes from '../modules/auth/auth.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import patientRoutes from '../modules/patients/patients.routes';
import monitoringRoutes from '../modules/monitoring/monitoring.routes';
import reportRoutes from '../modules/reports/reports.routes';
import settingRoutes from '../modules/settings/settings.routes';
import deviceRoutes from '../modules/devices/devices.routes';
import readingRoutes from '../modules/readings/readings.routes';
import { setSocketIO, initThresholdCache } from '../modules/readings/readings.controller';

// ─── Create Express app ──────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── ESP32 Device Auth Middleware ─────────────────────────────────────────────
// Memvalidasi API key ESP32 saat handshake Socket.IO
io.use(esp32SocketAuthMiddleware);

// ─── Global middleware ───────────────────────────────────────────────────────

// Security headers — use centralised config from security.ts
app.use(helmet({
  ...helmetConfig,
  // Override for API-only server:
  contentSecurityPolicy: false,   // CSP not needed for REST API
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — use centralised config from security.ts
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting — use centralised config from security.ts
const limiter = rateLimit(globalRateLimit);
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit(authRateLimit);
app.use('/api/v1/auth/login', authLimiter);

// Request logger
app.use(requestLogger);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    message: 'Server is running',
  });
});

// ─── Mount routes ────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/devices', deviceRoutes);

// ─── ESP8266 device readings (HTTP-only, no Socket.IO) ───────────────────────
// Endpoint untuk ESP8266 mengirim data sensor via HTTP POST.
// Autentikasi menggunakan x-api-key + x-device-id headers.
app.use('/api/v1/readings', readingRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: 'Route not found',
    error: 'NotFoundError',
  });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use(globalErrorHandler);

// ─── Initialize Socket.IO handlers ───────────────────────────────────────────
registerSocketHandlers(io);

// ─── Inject Socket.IO instance into readings controller ─────────────────────
// Allows the HTTP handler to broadcast real-time events to admin frontends.
setSocketIO(io);

// ─── Initialise reading threshold cache ──────────────────────────────────────
// Loads thresholds from Setting table and refreshes every 5 minutes.
initThresholdCache();

// ─── Graceful shutdown ───────────────────────────────────────────────────────
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Unhandled rejections ────────────────────────────────────────────────────
process.on('unhandledRejection', (reason: any) => {
  logger.error(`Unhandled Rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack || '');
  process.exit(1);
});

export { app, server, io };
