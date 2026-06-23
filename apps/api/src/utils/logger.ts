import { config } from '../config';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class StructuredLogger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const logData = {
      timestamp: this.getTimestamp(),
      level,
      message,
      ...(meta ? { metadata: meta } : {}),
    };

    if (config.nodeEnv === 'production') {
      return JSON.stringify(logData);
    }

    // Colorized console formatting for local development
    const colors = {
      reset: '\x1b[0m',
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
    };

    const color = colors[level] || colors.reset;
    const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
    return `[${logData.timestamp}] ${color}${level.padEnd(5)}${colors.reset} | ${message}${metaStr}`;
  }

  public debug(message: string, meta?: any): void {
    if (config.nodeEnv !== 'production' || process.env.LOG_LEVEL === 'DEBUG') {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, meta));
    }
  }

  public info(message: string, meta?: any): void {
    console.info(this.formatMessage(LogLevel.INFO, message, meta));
  }

  public warn(message: string, meta?: any): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, meta));
  }

  public error(message: string, error?: any, meta?: any): void {
    const errorDetails = error instanceof Error 
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

    const consolidatedMeta = {
      ...(errorDetails ? { error: errorDetails } : {}),
      ...(meta || {}),
    };

    console.error(this.formatMessage(LogLevel.ERROR, message, consolidatedMeta));
  }
}

export const logger = new StructuredLogger();
