import { ERROR_TEXTS } from './error-texts';

/**
 * Mirrors `ErrorCode` in crates/fc-core/src/error.rs (by hand; both sides test the list).
 * `backend_unavailable` and `unknown` exist only here.
 */
export const BACKEND_ERROR_CODES = [
  'not_found',
  'permission_denied',
  'io',
  'unsupported_format',
  'decode_failed',
  'no_output_device',
  'audio_device',
  'output_busy',
  'internal',
] as const;

export type ErrorCode = (typeof BACKEND_ERROR_CODES)[number] | 'backend_unavailable' | 'unknown';

/** Mirrors `AppError` in error.rs. */
export interface AppError {
  readonly code: ErrorCode;
  /** English, for logs – the window shows {@link describeError}. */
  readonly message: string;
  /** What a library said about it. */
  readonly details?: string;
}

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  ...BACKEND_ERROR_CODES,
  'backend_unavailable',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Anything thrown or rejected becomes an `AppError`; unknown shapes and codes are `unknown`. */
export function toAppError(e: unknown): AppError {
  if (isRecord(e) && typeof e['code'] === 'string' && typeof e['message'] === 'string') {
    const code = KNOWN_CODES.has(e['code']) ? (e['code'] as ErrorCode) : 'unknown';
    const details = typeof e['details'] === 'string' ? { details: e['details'] } : {};
    return { code, message: e['message'], ...details };
  }
  if (e instanceof Error) {
    return { code: 'unknown', message: e.message };
  }
  return { code: 'unknown', message: String(e) };
}

/** The text the window shows for an error (in the current language). */
export function describeError(error: AppError): string {
  const text = ERROR_TEXTS[error.code];
  return error.code === 'unknown' || error.code === 'internal' ? `${text}: ${error.message}` : text;
}
