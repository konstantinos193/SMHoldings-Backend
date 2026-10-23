/**
 * Channel registry — mirrors the Laravel config/logging.php model:
 * each named channel writes its own daily-rotated file plus stdout
 * (which Docker's json-file driver keeps as a fallback copy).
 *
 * Retention is in days, matching winston-daily-rotate-file maxFiles `${n}d`.
 * Add a channel here and it is immediately usable via
 * `appLogger.channel('name')` — no other wiring needed.
 */
export const LOG_DIR = process.env.LOG_DIR || 'logs';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const CHANNELS = {
  // Default sink: every `new Logger(X.name)` call in the codebase lands here.
  app: 14,

  // morgan request log — high volume, short retention.
  http: 7,

  // Slow-request / performance records (SlowRequestInterceptor).
  performance: 30,

  // Payment paths (Stripe, Nexi, Viva) — longest retention like Laravel's 90d.
  payments: 90,

  bookings: 30,
  'external-bookings': 30,
  auth: 30,
  email: 14,
  notifications: 14,
  inquiries: 14,

  // Admin/audit-relevant actions — kept a year like Laravel's audit channel.
  audit: 365,
} as const;

export type LogChannel = keyof typeof CHANNELS;

/** Shared error sink: every channel also forwards error+ here. */
export const ERROR_FILE_DAYS = 30;
