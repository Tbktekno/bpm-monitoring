// =============================================================================
// JWT Utilities — Token Generation, Verification & Blacklist
// =============================================================================
// Security requirements:
//   - Algorithm: HS256 (HMAC-SHA256)
//   - Secret:   JWT_SECRET from environment (minimum 64 chars enforced at boot)
//   - Issuer:   JWT_ISSUER from environment (default 'bpm-monitoring')
//   - Blacklist: In-memory Map<tokenHash, expiryMs> with background cleanup
// =============================================================================

import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import crypto from 'node:crypto';
import { AppError } from './app-error';

// ─── Configuration ───────────────────────────────────────────────────────────

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error(
      'JWT_SECRET environment variable must be at least 64 characters long',
    );
  }
  return secret;
})();

const JWT_ISSUER: string = process.env.JWT_ISSUER || 'bpm-monitoring';

// Use `as const` so TypeScript infers literal types (e.g. '24h') instead of
// `string`. This satisfies the `StringValue` branded type from `ms` that
// `jsonwebtoken` now expects for `expiresIn` / `notBefore`.
const JWT_ACCESS_EXPIRY_DEFAULT = '24h' as const;
const JWT_ACCESS_EXPIRY_REMEMBER = '7d' as const;
const JWT_REFRESH_EXPIRY_DEFAULT = '7d' as const;
const JWT_REFRESH_EXPIRY_REMEMBER = '30d' as const;

// ─── In-Memory Token Blacklist ───────────────────────────────────────────────
// Map<sha256(token), expiryTimestampMs>
const tokenBlacklist = new Map<string, number>();
const BLACKLIST_CLEANUP_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Compute a deterministic, fixed-length hash for a raw JWT string.
 * This prevents the raw token from being stored in memory after blacklisting.
 */
function getTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// ─── Background Cleanup ──────────────────────────────────────────────────────
// Every 15 minutes, purge blacklist entries whose TTL has passed.
// The interval timer does NOT prevent the Node.js process from exiting
// (no keep-alive reference).

const cleanupHandle = setInterval(() => {
  const now = Date.now();
  for (const [hash, expiryMs] of tokenBlacklist.entries()) {
    if (expiryMs <= now) {
      tokenBlacklist.delete(hash);
    }
  }
}, BLACKLIST_CLEANUP_MS);

// Allow the process to exit cleanly without clearing this interval manually.
cleanupHandle.unref();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a signed JWT access token for the given admin.
 *
 * @param admin     - Object containing `id` and `email`.
 * @param rememberMe - If `true`, token expires in 7 days instead of 24 hours.
 * @returns Signed JWT string (HS256).
 */
export function generateAccessToken(
  admin: { id: number; email: string },
  rememberMe: boolean = false,
): string {
  const expiresIn: string = rememberMe
    ? JWT_ACCESS_EXPIRY_REMEMBER
    : JWT_ACCESS_EXPIRY_DEFAULT;

  const payload: Record<string, string> = {
    sub: String(admin.id),
    email: admin.email,
  };

  const options: SignOptions = {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    expiresIn: expiresIn as any,
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Generate an access + refresh token pair.
 *
 * @param admin      - Object containing `id` and `email`.
 * @param rememberMe - Extends refresh token expiry (7d → 30d).
 * @returns Object with `accessToken` and `refreshToken`.
 */
export function generateTokenPair(
  admin: { id: number; email: string },
  rememberMe: boolean = false,
): { accessToken: string; refreshToken: string } {
  const accessToken = generateAccessToken(admin, rememberMe);

  const refreshExpiresIn: string = rememberMe
    ? JWT_REFRESH_EXPIRY_REMEMBER
    : JWT_REFRESH_EXPIRY_DEFAULT;

  const payload: Record<string, string> = {
    sub: String(admin.id),
    email: admin.email,
    type: 'refresh',
  };

  const options: SignOptions = {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    expiresIn: refreshExpiresIn as any,
  };

  const refreshToken = jwt.sign(payload, JWT_SECRET, options);

  return { accessToken, refreshToken };
}

/**
 * Verify a JWT token and return its decoded payload.
 *
 * @param token - Raw JWT string.
 * @returns Decoded `JwtPayload` from `jsonwebtoken`.
 * @throws {AppError} with status 401 if the token is invalid, expired, or
 *                    fails signature / issuer verification.
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
    });
    return decoded as JwtPayload;
  } catch (error: unknown) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    if (error instanceof jwt.NotBeforeError) {
      throw new AppError('Token is not yet active', 401, 'TOKEN_NOT_ACTIVE');
    }
    throw new AppError('Token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
  }
}

/**
 * Add a token to the in-memory blacklist so it cannot be used again
 * (e.g. on logout).
 *
 * @param token - Raw JWT string to revoke.
 */
export function blacklistToken(token: string): void {
  try {
    // Verify the token first to extract its expiry; this also rejects
    // tokens that are already invalid (we silently ignore those).
    const decoded = verifyToken(token);
    const exp = decoded.exp;

    // `exp` is guaranteed by `verifyToken` for a valid token, but guard
    // against the theoretical case of an infinite-lifetime token.
    if (exp !== undefined) {
      const hash = getTokenHash(token);
      tokenBlacklist.set(hash, exp * 1000); // seconds → milliseconds
    }
  } catch {
    // If the token is already expired or malformed there is no need to
    // blacklist it. Swallow the error silently.
  }
}

/**
 * Check whether a token has been blacklisted (revoked).
 *
 * @param token - Raw JWT string.
 * @returns `true` if the token is in the blacklist and has not yet expired.
 */
export function isTokenBlacklisted(token: string): boolean {
  const hash = getTokenHash(token);
  const expiryMs = tokenBlacklist.get(hash);

  if (expiryMs === undefined) {
    return false;
  }

  // Lazily clean up this single entry if its TTL has passed.
  if (expiryMs <= Date.now()) {
    tokenBlacklist.delete(hash);
    return false;
  }

  return true;
}
