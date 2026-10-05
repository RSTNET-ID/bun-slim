import { describe, expect, it } from 'bun:test';
import { loadEnv } from '@/config/env';

describe('Redis namespace environment behavior', () => {
  it('derives the namespace from service and environment by default', () => {
    const config = loadEnv({
      APP_ENV: 'development',
      SERVICE_NAME: 'artavax',
      DATABASE_URL: 'mysql://app:strong-secret@db.internal:3306/service',
      DB_DRIVER: 'mysql',
      DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'false',
    });

    expect(config.REDIS_NAMESPACE).toBe('artavax:development');
  });

  it('uses an explicit namespace override', () => {
    const config = loadEnv({
      APP_ENV: 'development',
      SERVICE_NAME: 'artavax',
      DATABASE_URL: 'mysql://app:strong-secret@db.internal:3306/service',
      DB_DRIVER: 'mysql',
      REDIS_NAMESPACE: 'artavax:development:idc1',
      DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'false',
    });

    expect(config.REDIS_NAMESPACE).toBe('artavax:development:idc1');
  });

  it('rejects the starter service name in production', () => {
    expect(() =>
      loadEnv({
        APP_ENV: 'production',
        SERVICE_NAME: 'example-service',
        DATABASE_URL: 'mysql://app:strong-secret@db.internal:3306/service',
        DB_DRIVER: 'mysql',
        DB_TLS_MODE: 'verify-full',
      DB_ALLOW_PUBLIC_KEY_RETRIEVAL: 'false',
      })
    ).toThrow('Invalid environment variables');
  });
});
