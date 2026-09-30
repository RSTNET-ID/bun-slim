import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors';
import { sendError } from '@/shared/http/response';
import { logger } from '@/shared/logger';

export const globalErrorHandler = (err: Error, c: Context) => {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof AppError) {
    logger.warn(`AppError [${err.code}]: ${err.message}`, {
      request_id: requestId,
      error_code: err.code,
      status: err.statusCode,
      details: err.details,
    });
    return sendError(
      c,
      err.code,
      err.message,
      err.statusCode as ContentfulStatusCode,
      err.exposeDetails ? err.details : undefined
    );
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('Validation Error', {
      request_id: requestId,
      details,
    });
    return sendError(c, 'VALIDATION_ERROR', 'Input validation failed', 400, details);
  }

  logger.error(`Unhandled Exception: ${err.message}`, {
    request_id: requestId,
    error: err.stack,
  });

  return sendError(c, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred', 500);
};
