export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'MUST_CHANGE_PASSWORD'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'REFERENCED'
  | 'PERIOD_NOT_FOUND'
  | 'PERIOD_CLOSED'
  | 'CYCLE_ARCHIVED'
  | 'INVALID_STATE'
  | 'SELF_APPROVAL'
  | 'IMPORT_INVALID'
  | 'INTERNAL';

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: unknown; fieldErrors?: Record<string, string> },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
    this.fieldErrors = options?.fieldErrors;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}
