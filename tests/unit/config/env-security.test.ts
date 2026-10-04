import { describe, expect, it } from 'bun:test';
import { envSchema } from '@/config/env';

const productionBase = {
  APP_ENV: 'production',
  SERVICE_NAME: 'security-test-service',
  DATABASE_URL: 'mysql://app_user:strong-runtime-secret@db.internal:3306/service',
  DB_DRIVER: 'mysql',
  DB_TLS_MODE: 'verify-full',
  TZ: 'UTC',
};

describe('production environment security guards', () => {
  it('forces UTC as the only supported runtime timezone', () => {
    const valid = envSchema.safeParse({ ...productionBase, TZ: 'UTC' });
    const invalid = envSchema.safeParse({ ...productionBase, TZ: 'Asia/Jakarta' });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('validates the scheduler IANA timezone independently from runtime UTC', () => {
    const jakarta = envSchema.safeParse({
      ...productionBase,
      SCHEDULER_TIMEZONE: 'Asia/Jakarta',
    });
    const invalid = envSchema.safeParse({
      ...productionBase,
      SCHEDULER_TIMEZONE: 'Mars/Olympus_Mons',
    });

    expect(jakarta.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

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
      DATABASE_URL: 'mysql://user:password@db.internal:3306/service',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unverified database TLS in production', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      DB_TLS_MODE: 'require',
    });
    expect(result.success).toBe(false);
  });

  it('rejects insecure public-key retrieval in production', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-MySQL database URL', () => {
    const result = envSchema.safeParse({
      ...productionBase,
      DATABASE_URL: 'postgres://app_user:strong-runtime-secret@db.internal:5432/service',
    });
    expect(result.success).toBe(false);
  });
});
