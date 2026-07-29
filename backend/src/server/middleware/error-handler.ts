// =============================================================================
// Global Error Handler Middleware
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/app-error';
import { logger } from './request-logger';

/**
 * Global error-handling middleware.
 * Catches all errors thrown (or passed via next(error)) and returns
 * a consistent JSON error response.
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log every error
  logger.error({
    message: err.message,
    name: err.name,
    stack: err.stack,
  });

  // Handle known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data: null,
      message: err.message,
      error: err.name,
    });
    return;
  }

  // Handle Prisma known errors
  if (err.constructor && err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        success: false,
        data: null,
        message: 'Resource already exists with this identifier',
        error: 'ConflictError',
      });
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        data: null,
        message: 'Resource not found',
        error: 'NotFoundError',
      });
      return;
    }
  }

  // Handle Prisma validation errors
  if (err.constructor && err.constructor.name === 'PrismaClientValidationError') {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Invalid data provided',
      error: 'ValidationError',
    });
    return;
  }

  // Handle unexpected errors in production (hide details)
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    data: null,
    message: isProduction ? 'Internal server error' : err.message,
    error: 'InternalServerError',
  });
}
