import { describe, expect, it } from 'bun:test';
import { redactLogContext } from '@/shared/logger/redact';

describe('log redaction', () => {
  it('redacts common secret keys recursively', () => {
    const result = redactLogContext({
      authorization: 'Bearer abc',
      databaseUrl: 'postgres://user:password@db:5432/app',
      nested: {
        api_key: 'secret-key',
        password: 'secret-password',
        safe: 'visible',
      },
    });

    expect(result).toEqual({
      authorization: '[REDACTED]',
      databaseUrl: '[REDACTED]',
      nested: {
        api_key: '[REDACTED]',
        password: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('redacts credentials embedded in URLs even under a non-sensitive key', () => {
    const result = redactLogContext({
      dependency: 'postgres://user:password@db.internal:5432/app',
    });

    expect(result?.dependency).toBe('postgres://[REDACTED]@db.internal:5432/app');
  });

  it('handles arrays and circular objects', () => {
    const circular: Record<string, unknown> = { token: 'abc' };
    circular.self = circular;

    const result = redactLogContext({
      items: [{ clientSecret: 'secret', value: 1 }],
      circular,
    });

    expect(result).toEqual({
      items: [{ clientSecret: '[REDACTED]', value: 1 }],
      circular: {
        token: '[REDACTED]',
        self: '[Circular]',
      },
    });
  });
});
