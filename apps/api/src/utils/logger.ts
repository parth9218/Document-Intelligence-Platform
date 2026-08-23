import winston from 'winston';
import { config } from '../config';

// ── Formats ────────────────────────────────────────────────────────────────

/**
 * Production: structured JSON, one line per log record.
 * Includes `timestamp`, `level`, `message`, and any `meta` passed by the caller.
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: false }), // stack controlled per-call below
  winston.format.json(),
);

/**
 * Development: human-readable colorized output.
 * Example: 2026-08-23T14:00:00Z [INFO ] API Server is running on port 3000
 */
const devFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.padEnd(5)} | ${message}${metaStr}`;
  }),
);

// ── Winston instance ────────────────────────────────────────────────────────

const winstonLogger = winston.createLogger({
  level: config.debugLog ? 'debug' : 'info',
  format: config.nodeEnv === 'prod' ? jsonFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
});

// ── Public logger facade ────────────────────────────────────────────────────
// Preserves the same call signature used across the entire codebase:
//   logger.debug(message, meta?)
//   logger.info(message, meta?)
//   logger.warn(message, meta?)
//   logger.error(message, error?, meta?)
// No import changes required in any other file.

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.debug(message, meta);
  },

  info(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.info(message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    winstonLogger.warn(message, meta);
  },

  /**
   * Log an error. When `DEBUG_LOG=true` the full stack trace from `error` is
   * included in the output; otherwise only `error.name` and `error.message`
   * are emitted, keeping production logs concise.
   */
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const includeStack = config.debugLog;

    const errorMeta: Record<string, unknown> =
      error instanceof Error
        ? {
            errorName: error.name,
            errorMessage: error.message,
            ...(includeStack && error.stack ? { stack: error.stack } : {}),
          }
        : error != null
          ? { error }
          : {};

    winstonLogger.error(message, { ...errorMeta, ...meta });
  },
};
