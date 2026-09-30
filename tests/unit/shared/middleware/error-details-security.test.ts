import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { globalErrorHandler } from '@/shared/middleware';

describe('application error detail exposure', () => {
  it('hides internal details by default', async () => {
    const app = new Hono();
    app.get('/', () => {
      throw new NotFoundError('Missing resource', {
        sql: 'SELECT secret_column FROM internal_table',
      });
    });
    app.onError(globalErrorHandler);

    const response = await app.request('/');
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.message).toBe('Missing resource');
    expect(payload.error.details).toBeUndefined();
  });

  it('allows validation details intended for the caller', async () => {
    const app = new Hono();
    app.get('/', () => {
      throw new ValidationError('Invalid input', {
        field: 'name',
        reason: 'required',
      });
    });
    app.onError(globalErrorHandler);

    const response = await app.request('/');
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.details).toEqual({
      field: 'name',
      reason: 'required',
    });
  });
});
