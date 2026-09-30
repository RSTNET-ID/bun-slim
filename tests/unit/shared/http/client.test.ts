import { describe, expect, it } from 'bun:test';
import { fetchWithPolicy, OutboundHttpError } from '@/shared/http/client';

describe('fetchWithPolicy', () => {
  it('propagates X-Request-ID to outbound requests', async () => {
    const receivedRequestIds: Array<string | null> = [];

    const response = await fetchWithPolicy(
      'https://example.test/resource',
      { method: 'GET' },
      {
        dependency: 'example-provider',
        requestId: 'req_test_123',
        maxRetries: 0,
        fetchFn: async (_input, init) => {
          receivedRequestIds.push(new Headers(init?.headers).get('X-Request-ID'));
          return new Response('ok', { status: 200 });
        },
      }
    );

    expect(response.status).toBe(200);
    expect(receivedRequestIds[0]).toBe('req_test_123');
  });

  it('retries transient GET responses', async () => {
    let attempts = 0;

    const response = await fetchWithPolicy(
      'https://example.test/resource',
      { method: 'GET' },
      {
        dependency: 'example-provider',
        maxRetries: 2,
        retryBaseMs: 0,
        fetchFn: async () => {
          attempts += 1;
          return new Response(attempts === 1 ? 'temporary' : 'ok', {
            status: attempts === 1 ? 503 : 200,
          });
        },
      }
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('does not retry POST by default', async () => {
    let attempts = 0;

    const response = await fetchWithPolicy(
      'https://example.test/resource',
      { method: 'POST', body: '{}' },
      {
        dependency: 'example-provider',
        maxRetries: 2,
        retryBaseMs: 0,
        fetchFn: async () => {
          attempts += 1;
          return new Response('temporary', { status: 503 });
        },
      }
    );

    expect(response.status).toBe(503);
    expect(attempts).toBe(1);
  });

  it('requires Idempotency-Key before retrying POST', async () => {
    expect(
      fetchWithPolicy(
        'https://example.test/resource',
        { method: 'POST', body: '{}' },
        {
          dependency: 'example-provider',
          retryUnsafe: true,
          maxRetries: 1,
          retryBaseMs: 0,
          fetchFn: async () => new Response('ok'),
        }
      )
    ).rejects.toThrow('Idempotency-Key');
  });

  it('retries idempotent POST when explicitly enabled', async () => {
    let attempts = 0;

    const response = await fetchWithPolicy(
      'https://example.test/resource',
      {
        method: 'POST',
        body: '{}',
        headers: { 'Idempotency-Key': 'idem_123' },
      },
      {
        dependency: 'example-provider',
        retryUnsafe: true,
        maxRetries: 1,
        retryBaseMs: 0,
        fetchFn: async () => {
          attempts += 1;
          return new Response(attempts === 1 ? 'temporary' : 'ok', {
            status: attempts === 1 ? 502 : 200,
          });
        },
      }
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('wraps final network failures without exposing URL details', async () => {
    let attempts = 0;

    try {
      await fetchWithPolicy(
        'https://example.test/resource?secret=do-not-log',
        { method: 'GET' },
        {
          dependency: 'example-provider',
          maxRetries: 1,
          retryBaseMs: 0,
          fetchFn: async () => {
            attempts += 1;
            throw new TypeError('network failed');
          },
        }
      );
      throw new Error('expected fetchWithPolicy to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OutboundHttpError);
      const outboundError = error as OutboundHttpError;
      expect(outboundError.code).toBe('OUTBOUND_NETWORK_ERROR');
      expect(outboundError.message).not.toContain('secret=');
      expect(outboundError.attempts).toBe(2);
      expect(attempts).toBe(2);
    }
  });

  it('returns OUTBOUND_TIMEOUT when the request deadline is exceeded', async () => {
    try {
      await fetchWithPolicy(
        'https://example.test/slow',
        { method: 'GET' },
        {
          dependency: 'slow-provider',
          timeoutMs: 10,
          maxRetries: 0,
          fetchFn: async (_input, init) => {
            await new Promise<never>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(init.signal?.reason ?? new Error('aborted')),
                { once: true }
              );
            });
            return new Response('unreachable');
          },
        }
      );
      throw new Error('expected fetchWithPolicy to time out');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OutboundHttpError);
      expect((error as OutboundHttpError).code).toBe('OUTBOUND_TIMEOUT');
    }
  });
});
