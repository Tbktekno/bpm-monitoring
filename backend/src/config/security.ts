// =============================================================================
// Security Configuration — CORS, Helmet & Rate Limiting
// =============================================================================
// Centralised security middleware configuration for the Express application.
// Every production deployment MUST review and adjust these values.
// =============================================================================

import type { CorsOptions } from 'cors';
import type { HelmetOptions } from 'helmet';

// ─── Environment helpers ─────────────────────────────────────────────────────

/**
 * Parse a comma/space-separated string into a trimmed, non-empty string array.
 * Returns `undefined` when the env var is not set or empty so callers can
 * fall back to a default value.
 *
 * Example: `"http://localhost:5173, https://app.example.com"` → `['http://localhost:5173', 'https://app.example.com']`
 */
function parseOriginList(value: string | undefined): string[] | undefined {
  if (!value || value.trim().length === 0) return undefined;
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// =============================================================================
// 1. CORS Configuration
// =============================================================================
// In production, explicitly list allowed origins instead of using a wildcard.
// The ESP32 devices connect via Socket.IO which uses a different transport
// and is not subject to CORS — their auth is handled by the API key middleware.

const allowedOrigins: string[] | undefined = parseOriginList(
  process.env.CORS_ORIGINS,
);

export const corsOptions: CorsOptions = {
  /**
   * Allowed origins:
   * - If `CORS_ORIGINS` is set in the environment, use that exact list.
   * - Otherwise, allow the common local dev ports (5173=Vite, 3000=Create React
   *   App, 8080=alternative dev server).
   *
   * In production, ALWAYS set `CORS_ORIGINS` explicitly.
   */
  origin: allowedOrigins ?? [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
  ],

  /**
   * Allow credentials (cookies, Authorization headers) to be included in
   * cross-origin requests. Required when the frontend and API are served from
   * different origins.
   */
  credentials: true,

  /**
   * HTTP methods permitted for preflight requests.
   */
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  /**
   * Allowed request headers.
   */
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'X-CSRF-Token',
  ],

  /**
   * Headers exposed to the browser client.
   */
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],

  /**
   * Max age for preflight cache (seconds). 86400 = 24 hours.
   */
  maxAge: 86400,
};

// =============================================================================
// 2. Helmet Configuration
// =============================================================================
// Helmet sets various HTTP security headers. The configuration below is a
// sensible baseline; adjust Content-Security-Policy to match your frontend's
// resource origins.

export const helmetConfig: HelmetOptions = {
  /**
   * Content Security Policy.
   * Restrict resources to same-origin by default. The `'unsafe-inline'` for
   * `style-src` is required by many frontend frameworks (Vite, CRA) in dev
   * mode. Remove it in production if your app uses only external stylesheets.
   */
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },

  /**
   * Prevent the browser from MIME-sniffing a response away from the declared
   * Content-Type.
   */
  noSniff: true,

  /**
   * Prevent clickjacking by disallowing the page to be loaded in a frame.
   */
  frameguard: { action: 'deny' },

  /**
   * Enable the browser's XSS filter (legacy — mainly for older browsers).
   */
  xssFilter: true,

  /**
   * Strict-Transport-Security: enforce HTTPS for the next 1 year.
   * Only set this when the application is served over TLS.
   */
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: false,
  },

  /**
   * Do not infer the referrer policy; send the full URL only for same-origin
   * requests.
   */
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  /**
   * Remove the `X-Powered-By` header that reveals the server technology.
   */
  hidePoweredBy: true,

  /**
   * Disable `dns-prefetch` to improve privacy (reduces DNS lookups
   * initiated by the browser for linked resources).
   */
  dnsPrefetchControl: { allow: false },
};

// =============================================================================
// 3. Rate-Limiting Configuration
// =============================================================================
// Uses `express-rate-limit`. Each limit can be applied to a specific route
// group using `app.use('/api/auth', rateLimit(authRateLimit))`.

/**
 * Global rate limit — applied to every API route.
 * Default: 200 requests per 15-minute window per IP.
 */
export const globalRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX ?? '200', 10),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    data: null,
    message: 'Too many requests, please try again later.',
    error: 'RateLimitError',
  },
};

/**
 * Authentication endpoint rate limit — stricter because auth endpoints are
 * the primary target for brute-force attacks.
 * Default: 10 requests per 15-minute window per IP.
 */
export const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: 'Too many authentication attempts, please try again later.',
    error: 'AuthRateLimitError',
  },
};

/**
 * ESP32 device ingestion rate limit — allows a higher throughput because
 * monitoring devices send vital-sign data frequently.
 * Default: 60 requests per 1-minute window per device IP.
 */
export const esp32RateLimit = {
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: parseInt(process.env.RATE_LIMIT_ESP32_MAX ?? '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: 'Device rate limit exceeded, please slow down.',
    error: 'DeviceRateLimitError',
  },
};
