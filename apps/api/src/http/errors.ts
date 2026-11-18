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

/**
 * Why the MT5 bridge refused, as it reported it — for logs, sync history and the
 * admin diagnose tool. Users only ever see the friendly `message` of the error.
 */
export interface BridgeFailure {
  /** LOGIN_REJECTED | TERMINAL_DOWN | TERMINAL_UNAVAILABLE | TIMEOUT | BRIDGE_UNREACHABLE | HTTP_<status> */
  code: string;
  /** e.g. AUTH_FAILED, LOGIN_DROPPED, PROCESS_NOT_RUNNING, UNPROVEN */
  reason?: string;
  mt5?: { code: number | null; message: string | null; meaning?: string };
  message?: string;
}

/** One line for logs and SyncRun.error: "LOGIN_REJECTED/LOGIN_DROPPED mt5 -10004 (No IPC connection): …" */
export function describeBridgeFailure(f: BridgeFailure): string {
  const mt5 = f.mt5?.code != null ? ` mt5 ${f.mt5.code} (${f.mt5.message ?? f.mt5.meaning ?? '?'})` : '';
  return `${f.code}${f.reason ? `/${f.reason}` : ''}${mt5}${f.message ? `: ${f.message}` : ''}`;
}

export class BrokerConnectionError extends AppError {
  constructor(message = 'Failed to connect to broker', public readonly bridge?: BridgeFailure) {
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
    public readonly bridge?: BridgeFailure,
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
    message = 'Active trading required — connect your Elefin account and close at least 1 trade in the last 30 days.',
    public readonly tradeCount7d?: number,
  ) {
    super(403, 'ACCESS_INACTIVE', message);
  }
}
