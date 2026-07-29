// =============================================================================
// gRPC Auth Interceptor — Server-Side JWT Verification
// =============================================================================
// A @grpc/grpc-js server interceptor that:
//   1. Extracts a Bearer JWT from the incoming `authorization` metadata.
//   2. Verifies the token signature, issuer, and expiry.
//   3. Checks the in-memory blacklist.
//   4. Passes the admin identity through metadata for downstream handlers.
//   5. Skips auth entirely for methods in `AUTH_SKIP_METHODS` (e.g. Login).
//
// If authentication fails the interceptor immediately calls
// `call.sendStatus()` with `UNAUTHENTICATED`, preventing the handler from
// being invoked.
//
// Usage:
//   import { Server } from '@grpc/grpc-js';
//   import { authInterceptor } from '../shared/grpc-auth';
//   const server = new Server({ interceptors: [authInterceptor()] });
// =============================================================================

import * as grpc from '@grpc/grpc-js';
import type {
  ServerInterceptor,
  ServerInterceptingCallInterface,
  ServerListener,
  ServerMethodDefinition,
} from '@grpc/grpc-js';
import { verifyToken, isTokenBlacklisted } from './jwt';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * gRPC method names (the last path component) that do NOT require
 * authentication.
 *
 * For a proto service `AdminService` with an RPC `Login`, the full path
 * would be `/admin.AdminService/Login` and the extracted method name is
 * `Login`.
 */
const AUTH_SKIP_METHODS: ReadonlySet<string> = new Set<string>(['Login']);

// ─── Interceptor ─────────────────────────────────────────────────────────────

/**
 * Create a gRPC server interceptor that authenticates every incoming call
 * unless the RPC method name is in `AUTH_SKIP_METHODS`.
 *
 * On success:
 *   - The decoded `sub` and `email` claims are injected into the call
 *     metadata as `x-admin-id` and `x-admin-email` respectively.
 *
 * On failure:
 *   - The interceptor responds with `grpc.status.UNAUTHENTICATED`
 *     and a descriptive (yet generic) error message, then terminates
 *     the call.
 *
 * @returns A `ServerInterceptor` ready to be passed to the `Server`
 *          constructor via the `interceptors` option.
 */
export function authInterceptor(): ServerInterceptor {
  return (
    methodDescriptor: ServerMethodDefinition<any, any>,
    call: ServerInterceptingCallInterface,
  ): grpc.ServerInterceptingCall => {
    const methodPath: string = methodDescriptor.path;
    const methodName: string = methodPath.split('/').pop() ?? '';

    // ── 1. Skip auth for public methods ──────────────────────────────────
    if (AUTH_SKIP_METHODS.has(methodName)) {
      return new grpc.ServerInterceptingCall(call);
    }

    // ── 2. Return wrapped call with listener interceptor ─────────────────
    return new grpc.ServerInterceptingCall(call, {
      start: (next: (listener?: ServerListener) => void): void => {
        const listener: ServerListener = {
          onReceiveMetadata: (
            metadata: grpc.Metadata,
            metadataNext: (metadata: grpc.Metadata) => void,
          ): void => {
            // ── a. Extract header ──────────────────────────────────────
            const authValues = metadata.get('authorization');
            if (authValues.length === 0) {
              call.sendStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Authentication required',
              });
              return;
            }

            const authHeader = authValues[0] as string;

            // ── b. Parse "Bearer <token>" ──────────────────────────────
            const parts: string[] = authHeader.split(' ');
            if (parts.length !== 2 || parts[0] !== 'Bearer') {
              call.sendStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Invalid authorization format. Expected: Bearer <token>',
              });
              return;
            }

            const token: string = parts[1];

            // ── c. Check blacklist ─────────────────────────────────────
            try {
              if (isTokenBlacklisted(token)) {
                call.sendStatus({
                  code: grpc.status.UNAUTHENTICATED,
                  details: 'Token has been revoked',
                });
                return;
              }
            } catch {
              call.sendStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Authentication service unavailable',
              });
              return;
            }

            // ── d. Verify token ────────────────────────────────────────
            let decoded: import('jsonwebtoken').JwtPayload;
            try {
              decoded = verifyToken(token);
            } catch {
              call.sendStatus({
                code: grpc.status.UNAUTHENTICATED,
                details: 'Invalid or expired token',
              });
              return;
            }

            // ── e. Inject admin context into metadata ──────────────────
            if (decoded.sub) {
              metadata.set('x-admin-id', decoded.sub);
            }
            if (typeof decoded.email === 'string') {
              metadata.set('x-admin-email', decoded.email);
            }

            // ── f. Forward the enriched metadata ───────────────────────
            metadataNext(metadata);
          },

          // Pass-through for message, half-close, and cancel
          onReceiveMessage: (
            message: any,
            messageNext: (message: any) => void,
          ): void => {
            messageNext(message);
          },

          onReceiveHalfClose: (halfNext: () => void): void => {
            halfNext();
          },

          onCancel: (): void => {
            // No cleanup needed — blacklist entries are managed centrally.
          },
        };

        next(listener);
      },
    });
  };
}
