import { config } from '@/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  request_id?: string;
  method?: string;
  path?: string;
  status?: number;
  duration_ms?: number;
  error?: unknown;
  [key: string]: unknown;
}

class Logger {
  private serviceName: string;
  private environment: string;

  constructor() {
    this.serviceName = config.SERVICE_NAME;
    this.environment = config.APP_ENV;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      ...context,
    };
    return JSON.stringify(payload);
  }

  public info(message: string, context?: LogContext) {
    console.log(this.formatMessage('info', message, context));
  }

  public warn(message: string, context?: LogContext) {
    console.warn(this.formatMessage('warn', message, context));
  }

  public error(message: string, context?: LogContext) {
    console.error(this.formatMessage('error', message, context));
  }

  public debug(message: string, context?: LogContext) {
    if (config.LOG_LEVEL === 'debug') {
      console.debug(this.formatMessage('debug', message, context));
    }
  }
}

export const logger = new Logger();
