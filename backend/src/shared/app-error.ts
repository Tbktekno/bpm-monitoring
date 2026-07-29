// =============================================================================
// AppError — Application-Level Error Class
// =============================================================================
// All services and middleware MUST use this class (or its subclasses) for
// operational errors so that the global error handler can distinguish
// expected failures from programming bugs.
// =============================================================================

/**
 * Application-level operational error.
 *
 * - `statusCode` : HTTP / gRPC status code (default 500)
 * - `code`       : Machine-readable error code for the client (default 'INTERNAL_ERROR')
 * - `isOperational` : `true` for expected failures; `false` for programming bugs
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    // Ensure the prototype chain is correct when using TypeScript with ES2020+
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture a clean stack trace, excluding the constructor itself
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Convenience subclasses ───────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(message: string = 'Validation failed', fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}
