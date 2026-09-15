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

// No AI provider is configured (no API key / AI_PROVIDER=none) or the provider
// call failed. 503 so callers can fall back to rule-based insights gracefully.
export class AiUnavailableError extends AppError {
  constructor(message = 'AI coach is unavailable right now.') {
    super(503, 'AI_UNAVAILABLE', message);
  }
}

// The user exceeded their per-user AI request budget for the current window.
export class AiRateLimitError extends AppError {
  constructor(message = "You're sending messages too fast — give the coach a moment and try again.") {
    super(429, 'AI_RATE_LIMIT', message);
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

export class MaintenanceError extends AppError {
  constructor(
    message = 'The platform is temporarily under maintenance. Please try again later.',
    public readonly maintenanceMessage?: string,
  ) {
    super(503, 'MAINTENANCE', message);
  }
}

export class AccessElefinRequiredError extends AppError {
  constructor(message = 'Elefin account verification required') {
    super(403, 'ACCESS_ELEFIN_REQUIRED', message);
  }
}

export class AccessInactiveError extends AppError {
  constructor(
    message = 'Active trading required — connect your Elefin account and complete at least 2 trades in the past 7 days.',
    public readonly tradeCount7d?: number,
  ) {
    super(403, 'ACCESS_INACTIVE', message);
  }
}
