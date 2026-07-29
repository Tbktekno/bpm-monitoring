// =============================================================================
// Request Logger
// =============================================================================
// Winston-based structured logger. Logs HTTP requests and application events.
// =============================================================================

import winston from 'winston';
import { Request, Response, NextFunction } from 'express';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 10,
    }),
  ],
});

function statusColor(code: number): string {
  if (code >= 500) return '\x1b[31m'; // red
  if (code >= 400) return '\x1b[33m'; // yellow
  if (code >= 300) return '\x1b[36m'; // cyan
  return '\x1b[32m';                   // green
}

/**
 * HTTP request logging middleware.
 * Logs method, URL, status code, and response time with colorized status.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const color = statusColor(statusCode);
    const reset = '\x1b[0m';
    logger.log(level, `${method} ${originalUrl} → ${color}${statusCode}${reset} (${duration}ms)`);
  });

  next();
}
