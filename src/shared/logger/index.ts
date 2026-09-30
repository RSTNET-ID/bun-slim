/* eslint-disable no-console */
import { config } from '@/config';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogContext {
  request_id?: string;
  method?: string;
  path?: string;
  status?: number;
  duration_ms?: number;
  error?: unknown;
  [key: string]: unknown;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

class Logger {
  private readonly serviceName = config.SERVICE_NAME;
  private readonly environment = config.APP_ENV;
  private readonly configuredLevel = config.LOG_LEVEL;

  private isEnabled(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[this.configuredLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      ...context,
    });
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.isEnabled(level)) return;

    const payload = this.formatMessage(level, message, context);

    if (level === 'fatal' || level === 'error') {
      console.error(payload);
      return;
    }

    if (level === 'warn') {
      console.warn(payload);
      return;
    }

    console.log(payload);
  }

  fatal(message: string, context?: LogContext): void {
    this.write('fatal', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  trace(message: string, context?: LogContext): void {
    this.write('trace', message, context);
  }
}

export const logger = new Logger();
