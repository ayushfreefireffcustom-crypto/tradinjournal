export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Validation failed',
    public readonly fields?: Record<string, string[]>,
  ) {
    super(422, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, 'CONFLICT', message);
  }
}

export class BrokerConnectionError extends AppError {
  constructor(message = 'Failed to connect to broker') {
    super(502, 'BROKER_CONNECTION_ERROR', message);
  }
}

// The MT5 login/password we have on file was rejected by the broker — almost
// always because the trader changed their MT5 password. 409 (not 5xx) so it
// isn't logged as a server fault and the readable message reaches the client.
export class BrokerAuthError extends AppError {
  constructor(
    message = "We couldn't sign in to your MT5 account. Your broker password may have changed — update it under Brokers and try again.",
  ) {
    super(409, 'BROKER_AUTH_FAILED', message);
  }
}
