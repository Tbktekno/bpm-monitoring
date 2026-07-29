// =============================================================================
// Auth Controller — Login, Logout, Me
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { UnauthorizedError, ValidationError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

// Token blacklist (in-memory — use Redis for production)
const tokenBlacklist = new Set<string>();

/**
 * POST /api/v1/auth/login
 * Validates email + password, returns JWT token.
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, rememberMe } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find admin
    const admin = await prisma.admin.findUnique({
      where: { email: normalizedEmail },
    });

    if (!admin) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate JWT
    const expiresIn = rememberMe ? env.jwtRememberExpiresIn : env.jwtExpiresIn;
    const token = jwt.sign(
      { adminId: admin.id, email: admin.email },
      env.jwtSecret,
      { expiresIn } as jwt.SignOptions
    );

    // Log login
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'LOGIN',
        details: 'Admin login',
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      },
    });

    logger.info(`Admin login: ${admin.email}`);

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
        },
      },
      message: 'Login successful',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * Blacklists the current token.
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      tokenBlacklist.add(token);

      // Auto-remove from blacklist after 7 days (max token lifetime)
      setTimeout(() => tokenBlacklist.delete(token), 7 * 24 * 60 * 60 * 1000);
    }

    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'LOGOUT',
          details: 'Admin logout',
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
      logger.info(`Admin logout: ${req.admin.email}`);
    }

    res.json({
      success: true,
      data: null,
      message: 'Logout successful',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated admin's profile.
 */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.admin) {
      throw new UnauthorizedError('Not authenticated');
    }

    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedError('Admin not found');
    }

    res.json({
      success: true,
      data: admin,
      message: 'Profile retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Check if a token is blacklisted.
 */
export function isTokenBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}
