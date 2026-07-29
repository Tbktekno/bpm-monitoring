// =============================================================================
// Auth Middleware — Express Bearer-Token Authentication
// =============================================================================
// Extracts a JWT from the Authorization header, verifies it, checks the
// in-memory blacklist, and attaches the decoded admin payload to `req.admin`.
//
// Usage:
//   import { authMiddleware } from '../shared/auth-middleware';
//   router.get('/patients', authMiddleware, PatientsController.list);
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenBlacklisted } from './jwt';
import { AppError } from './app-error';
import { prisma } from '../config/database';

// ─── Augment Express Request ─────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated admin user context.
       * `undefined` when no auth middleware has run.
       */
      admin?: {
        id: number;
        email: string;
        name: string;
      };
    }
  }
}

// ─── Error response helper ───────────────────────────────────────────────────

interface ErrorResponseBody {
  error: {
    message: string;
    code: string;
  };
}

function sendError(res: Response, statusCode: number, message: string, code: string): void {
  const body: ErrorResponseBody = { error: { message, code } };
  res.status(statusCode).json(body);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that authenticates requests via a Bearer JWT.
 *
 * Flow:
 *   1. Read `Authorization: Bearer <token>` header.
 *   2. Verify the token signature, issuer, and expiry via `verifyToken()`.
 *   3. Check the in-memory blacklist (tokens revoked on logout).
 *   4. Attach `{ id, email }` to `req.admin`.
 *   5. Call `next()` on success or respond 401 on failure.
 *
 * Security notes:
 *   - Only accepts the `Bearer` scheme (rejects `Token`, `Basic`, etc.).
 *   - Rejects tokens with missing or non-numeric `sub` claims.
 *   - Never exposes the raw token or internal error details to the client.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ── 1. Extract header ────────────────────────────────────────────────────
  const authHeader: string | undefined = req.headers.authorization;

  if (!authHeader) {
    sendError(res, 401, 'Authorization header is required', 'NO_AUTH_HEADER');
    return;
  }

  // ── 2. Parse scheme ──────────────────────────────────────────────────────
  const parts: string[] = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    sendError(
      res,
      401,
      'Authorization header must use the format: Bearer <token>',
      'INVALID_AUTH_FORMAT',
    );
    return;
  }

  const token: string = parts[1];

  // ── 3. Check blacklist ───────────────────────────────────────────────────
  try {
    if (isTokenBlacklisted(token)) {
      sendError(res, 401, 'Token has been revoked', 'TOKEN_REVOKED');
      return;
    }
  } catch {
    // isTokenBlacklisted is synchronous and does not throw, but guard anyway.
    sendError(res, 401, 'Authentication failed', 'AUTH_FAILED');
    return;
  }

  // ── 4. Verify token ──────────────────────────────────────────────────────
  let decoded: import('jsonwebtoken').JwtPayload;
  try {
    decoded = verifyToken(token);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      sendError(res, error.statusCode, error.message, error.code);
      return;
    }
    sendError(res, 401, 'Authentication failed', 'AUTH_FAILED');
    return;
  }

  // ── 5. Extract admin identity ────────────────────────────────────────────
  if (!decoded.sub || typeof decoded.sub !== 'string') {
    sendError(res, 401, 'Invalid token payload: missing subject', 'INVALID_TOKEN');
    return;
  }

  const adminId = parseInt(decoded.sub, 10);
  if (Number.isNaN(adminId)) {
    sendError(res, 401, 'Invalid token payload: non-numeric subject', 'INVALID_TOKEN');
    return;
  }

  const email = decoded.email;
  if (typeof email !== 'string' || !email.includes('@')) {
    sendError(res, 401, 'Invalid token payload: missing or invalid email', 'INVALID_TOKEN');
    return;
  }

  // ── 6. Lookup admin name & attach ────────────────────────────────────────
  let adminName = email;
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    if (admin) adminName = admin.name;
  } catch {
    // Silently fall back to email
  }

  req.admin = { id: adminId, email, name: adminName };

  next();
}
