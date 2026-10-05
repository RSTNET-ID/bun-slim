import { describe, expect, it } from 'bun:test';
import { loadEnv } from '@/config/env';

describe('Redis namespace environment behavior', () => {
  it('derives the namespace from service and environment by default', () => {
    const config = loadEnv({
      APP_ENV: 'development',
      SERVICE_NAME: 'artavax',
      DATABASE_URL: 'postgres://app:strong-secret@db.internal:5432/service',
      DB_DRIVER: 'postgres',
    });

    expect(config.REDIS_NAMESPACE).toBe('artavax:development');
  });

  it('uses an explicit namespace override', () => {
    const config = loadEnv({
      APP_ENV: 'development',
      SERVICE_NAME: 'artavax',
      DATABASE_URL: 'postgres://app:strong-secret@db.internal:5432/service',
      DB_DRIVER: 'postgres',
      REDIS_NAMESPACE: 'artavax:development:idc1',
    });

    expect(config.REDIS_NAMESPACE).toBe('artavax:development:idc1');
  });

  it('rejects the starter service name in production', () => {
    expect(() =>
      loadEnv({
        APP_ENV: 'production',
        SERVICE_NAME: 'example-service',
        DATABASE_URL: 'postgres://app:strong-secret@db.internal:5432/service',
        DB_DRIVER: 'postgres',
        DB_TLS_MODE: 'verify-full',
      })
    ).toThrow('Invalid environment variables');
  });
});
