// =============================================================================
// Auth — Unit Tests
// =============================================================================
// Tests JWT generation/verification, token blacklist operations,
// and bcrypt password hashing.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateTokenPair,
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
} from '../shared/jwt';

// =============================================================================
// JWT Generation & Verification
// =============================================================================
describe('JWT generation and verification', () => {
  const admin = { id: 1, email: 'admin@test.com' };

  it('generates a valid access token with default expiry', () => {
    const token = generateAccessToken(admin);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('generates a valid access token with rememberMe (7d expiry)', () => {
    const token = generateAccessToken(admin, true);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('verifyToken returns decoded payload for valid token', () => {
    const token = generateAccessToken(admin);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(String(admin.id));
    expect(decoded.email).toBe(admin.email);
    expect(decoded.iss).toBe('bpm-monitoring');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('verifyToken throws TOKEN_EXPIRED for expired token', () => {
    // Use jsonwebtoken to sign a token that expires immediately (in the past)
    const secret = process.env.JWT_SECRET || '';
    const expiredToken = jwt.sign(
      { sub: '1', email: 'admin@test.com' },
      secret,
      { algorithm: 'HS256', issuer: 'bpm-monitoring', expiresIn: -1 }, // negative = already expired
    );

    expect(() => verifyToken(expiredToken)).toThrow('Token has expired');
  });

  it('verifyToken throws INVALID_TOKEN for malformed token', () => {
    expect(() => verifyToken('not-a-valid-token')).toThrow('Invalid token');
    expect(() => verifyToken('')).toThrow('Invalid token');
  });

  it('verifyToken throws INVALID_TOKEN for token with wrong secret', () => {
    const fakeSecret = 'this-is-a-different-secret-that-is-also-at-least-sixty-four-chars-long-for-hs256!!';
    const fakeToken = jwt.sign(
      { sub: '1', email: 'admin@test.com' },
      fakeSecret,
      { algorithm: 'HS256', issuer: 'bpm-monitoring' },
    );
    expect(() => verifyToken(fakeToken)).toThrow('Invalid token');
  });
});

// =============================================================================
// Token Pair
// =============================================================================
describe('generateTokenPair', () => {
  const admin = { id: 2, email: 'admin2@test.com' };

  it('returns an object with accessToken and refreshToken', () => {
    const pair = generateTokenPair(admin);
    expect(pair).toHaveProperty('accessToken');
    expect(pair).toHaveProperty('refreshToken');
    expect(typeof pair.accessToken).toBe('string');
    expect(typeof pair.refreshToken).toBe('string');
  });

  it('access token and refresh token are different', () => {
    const pair = generateTokenPair(admin);
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });

  it('refresh token has type claim set to "refresh"', () => {
    const pair = generateTokenPair(admin);
    const decoded = verifyToken(pair.refreshToken);
    expect(decoded.type).toBe('refresh');
  });

  it('generates pair with rememberMe option', () => {
    const pair = generateTokenPair(admin, true);
    const decoded = verifyToken(pair.accessToken);
    expect(decoded.sub).toBe(String(admin.id));
  });
});

// =============================================================================
// Token Blacklist
// =============================================================================
describe('token blacklist', () => {
  const adminA = { id: 10, email: 'adminA@test.com' };
  const adminB = { id: 20, email: 'adminB@test.com' };

  it('fresh token is not blacklisted', () => {
    const token = generateAccessToken(adminA);
    expect(isTokenBlacklisted(token)).toBe(false);
  });

  it('blacklisted token returns true', () => {
    const token = generateAccessToken(adminA);
    blacklistToken(token);
    expect(isTokenBlacklisted(token)).toBe(true);
  });

  it('blacklisting same token twice does not throw', () => {
    const token = generateAccessToken(adminA);
    blacklistToken(token);
    blacklistToken(token); // Should not throw
    expect(isTokenBlacklisted(token)).toBe(true);
  });

  it('blacklisting an invalid token does not throw', () => {
    expect(() => blacklistToken('invalid-token')).not.toThrow();
    expect(() => blacklistToken('')).not.toThrow();
  });

  it('different tokens are independently tracked', () => {
    // Use different admin objects to guarantee different tokens
    const tokenA = generateAccessToken(adminA);
    const tokenB = generateAccessToken(adminB);
    blacklistToken(tokenA);
    expect(isTokenBlacklisted(tokenA)).toBe(true);
    expect(isTokenBlacklisted(tokenB)).toBe(false);
  });
});

// =============================================================================
// Password Hashing (bcrypt)
// =============================================================================
describe('password hashing with bcrypt', () => {
  const plainPassword = 'SecureP@ss123';

  it('generates a hash from a password', async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    // bcrypt hash format: $2b$10$...
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('validates correct password against hash', async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    const isValid = await bcrypt.compare(plainPassword, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password against hash', async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    const isValid = await bcrypt.compare('WrongPassword123', hash);
    expect(isValid).toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const hash1 = await bcrypt.hash(plainPassword, 10);
    const hash2 = await bcrypt.hash(plainPassword, 10);
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty password', async () => {
    const hash = await bcrypt.hash('', 10);
    const isValid = await bcrypt.compare('', hash);
    expect(isValid).toBe(true);
  });

  it('rejects empty comparison against non-empty password hash', async () => {
    const hash = await bcrypt.hash(plainPassword, 10);
    const isValid = await bcrypt.compare('', hash);
    expect(isValid).toBe(false);
  });
});
