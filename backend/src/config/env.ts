// =============================================================================
// Environment Configuration
// =============================================================================
// Loads and validates environment variables using dotenv.
// All config values are readonly singletons.
// =============================================================================

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly jwtRememberExpiresIn: string;
  readonly grpcHost: string;
  readonly grpcPort: number;
  readonly corsOrigin: string;
}

function validateEnv(): EnvConfig {
  const port = parseInt(process.env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid port number (1-65535)');
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters');
  }

  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
  const jwtRememberExpiresIn = process.env.JWT_REMEMBER_EXPIRES_IN || '7d';

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const grpcHost = process.env.GRPC_HOST || 'localhost';
  const grpcPort = parseInt(process.env.GRPC_PORT || '50051', 10);
  if (isNaN(grpcPort) || grpcPort < 1 || grpcPort > 65535) {
    throw new Error('GRPC_PORT must be a valid port number (1-65535)');
  }

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    port,
    nodeEnv,
    databaseUrl,
    jwtSecret,
    jwtExpiresIn,
    jwtRememberExpiresIn,
    grpcHost,
    grpcPort,
    corsOrigin,
  };
}

export const env: EnvConfig = validateEnv();
