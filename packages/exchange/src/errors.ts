// Typed exchange errors. Adapters map venue error codes onto these so callers
// can react (pause a follow, show the user a fix, back off) without parsing
// venue strings. Messages are safe to show users: never include keys or
// signatures.

export type ExchangeErrorCode =
  | 'AUTH'
  | 'IP_NOT_WHITELISTED'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'INSUFFICIENT_MARGIN'
  | 'SIZE_TOO_SMALL'
  | 'NO_POSITION'
  | 'INSTRUMENT'
  | 'ORDER_NOT_FOUND'
  | 'REJECTED'
  | 'UNAVAILABLE'
  | 'REQUEST';

export class ExchangeError extends Error {
  constructor(
    readonly code: ExchangeErrorCode,
    message: string,
    readonly status?: number,
    /** Raw venue error code, for logs. */
    readonly venueCode?: string,
  ) {
    super(message);
    this.name = 'ExchangeError';
  }

  /** Errors that mean the credential itself is unusable until the user acts. */
  get isCredentialProblem(): boolean {
    return this.code === 'AUTH' || this.code === 'IP_NOT_WHITELISTED' || this.code === 'PERMISSION';
  }

  /** Worth retrying later with the same input. */
  get isTransient(): boolean {
    return this.code === 'RATE_LIMIT' || this.code === 'UNAVAILABLE';
  }
}

export class ExchangeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeConfigError';
  }
}
