import { describe, expect, it } from 'bun:test';
import { envSchema } from '@/config/env';

const productionBase = {
  APP_ENV: 'production',
  SERVICE_NAME: 'security-test-service',
  DATABASE_URL: 'postgres://app_user:strong-runtime-secret@db.internal:5432/service',
  DB_DRIVER: 'postgres',
};

describe('production environment security guards', () => {
  it('rejects example CRUD routes in production', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      EXAMPLE_ROUTES_ENABLED: 'true',
    });

    expect(result.success).toBe(false);
  });

  it('requires a metrics token when production metrics are enabled', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      METRICS_ENABLED: 'true',
    });

    expect(result.success).toBe(false);
  });

  it('accepts protected production metrics', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      METRICS_ENABLED: 'true',
      METRICS_TOKEN: 'a-strong-metrics-token-value-123456',
    });

    expect(result.success).toBe(true);
  });

  it('rejects known placeholder database credentials in production', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      DATABASE_URL: 'postgres://user:password@db.internal:5432/service',
    });

    expect(result.success).toBe(false);
  });
});
