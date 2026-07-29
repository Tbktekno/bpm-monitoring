// =============================================================================
// JWT Authentication Middleware
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/app-error';
import { prisma } from '../../config/database';
import { isTokenBlacklisted } from '../../modules/auth/auth.controller';

export interface JwtPayload {
  adminId: number;
  email: string;
  iat?: number;
  exp?: number;
}

// Extend Express Request to include authenticated admin
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: number;
        email: string;
        name: string;
      };
    }
  }
}

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from the Authorization header.
 * On success, attaches the admin object to req.admin.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header. Format: Bearer <token>');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Token not provided');
    }

    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;

    // Check token blacklist (tokens revoked after logout)
    if (isTokenBlacklisted(token)) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Verify admin still exists in database
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: { id: true, email: true, name: true },
    });

    if (!admin) {
      throw new UnauthorizedError('Admin account no longer exists');
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token has expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(error);
    }
  }
}
