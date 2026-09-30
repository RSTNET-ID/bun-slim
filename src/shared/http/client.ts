import { config } from '@/config';
import { logger } from '@/shared/logger';
import { serviceMetrics } from '@/shared/observability/metrics';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type FetchFunction = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface OutboundHttpOptions {
  dependency: string;
  requestId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  retryUnsafe?: boolean;
  fetchFn?: FetchFunction;
}

export class OutboundHttpError extends Error {
  constructor(
    message: string,
    readonly code: 'OUTBOUND_TIMEOUT' | 'OUTBOUND_NETWORK_ERROR',
    readonly dependency: string,
    readonly attempts: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'OutboundHttpError';
  }
}

export async function fetchWithPolicy(
  input: string | URL,
  init: RequestInit = {},
  options: OutboundHttpOptions
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? config.OUTBOUND_HTTP_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? config.OUTBOUND_HTTP_MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? config.OUTBOUND_HTTP_RETRY_BASE_MS;
  const retryAllowed = SAFE_RETRY_METHODS.has(method) || options.retryUnsafe === true;
  const fetchFn: FetchFunction = options.fetchFn ?? fetch;
  const totalAttempts = retryAllowed ? maxRetries + 1 : 1;

  const baseHeaders = new Headers(init.headers);
  if (
    options.retryUnsafe === true &&
    (method === 'POST' || method === 'PATCH') &&
    !baseHeaders.has('Idempotency-Key')
  ) {
    throw new Error(`Retrying ${method} requires an Idempotency-Key header`);
  }

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const startedAt = performance.now();
    const controller = new AbortController();
    const cleanupParentSignal = linkAbortSignal(init.signal, controller);
    const timeout = setTimeout(() => controller.abort(new Error('outbound_timeout')), timeoutMs);

    const headers = new Headers(baseHeaders);
    if (options.requestId && !headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', options.requestId);
    }

    try {
      const response = await fetchFn(input, {
        ...init,
        method,
        headers,
        signal: controller.signal,
      });

      serviceMetrics.recordOutboundRequest(
        options.dependency,
        method,
        response.status,
        performance.now() - startedAt
      );

      if (!RETRYABLE_STATUS.has(response.status) || attempt >= totalAttempts) {
        return response;
      }

      await response.body?.cancel();

      logger.warn('Outbound HTTP transient response; retrying', {
        dependency: options.dependency,
        method,
        status: response.status,
        attempt,
        max_attempts: totalAttempts,
        request_id: options.requestId,
      });

      await retrySleep(retryBaseMs, attempt, init.signal);
    } catch (error: unknown) {
      serviceMetrics.recordOutboundRequest(
        options.dependency,
        method,
        'network_error',
        performance.now() - startedAt
      );

      if (init.signal?.aborted) {
        throw error;
      }

      const timedOut = controller.signal.aborted;
      if (attempt >= totalAttempts) {
        throw new OutboundHttpError(
          timedOut
            ? `Outbound request to ${options.dependency} timed out`
            : `Outbound request to ${options.dependency} failed`,
          timedOut ? 'OUTBOUND_TIMEOUT' : 'OUTBOUND_NETWORK_ERROR',
          options.dependency,
          attempt,
          { cause: error }
        );
      }

      logger.warn('Outbound HTTP request failed; retrying', {
        dependency: options.dependency,
        method,
        attempt,
        max_attempts: totalAttempts,
        request_id: options.requestId,
        error_name: error instanceof Error ? error.name : 'UnknownError',
      });

      await retrySleep(retryBaseMs, attempt, init.signal);
    } finally {
      clearTimeout(timeout);
      cleanupParentSignal();
    }
  }

  throw new Error('Unreachable outbound HTTP state');
}

function linkAbortSignal(
  parent: AbortSignal | null | undefined,
  controller: AbortController
): () => void {
  if (!parent) return () => {};

  if (parent.aborted) {
    controller.abort(parent.reason);
    return () => {};
  }

  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  return () => parent.removeEventListener('abort', abort);
}

async function retrySleep(
  baseMs: number,
  attempt: number,
  signal: AbortSignal | null | undefined
): Promise<void> {
  if (baseMs <= 0) return;

  const exponential = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), 30_000);
  const jitter = Math.floor(exponential * Math.random() * 0.2);
  const delayMs = exponential + jitter;

  await sleep(delayMs, signal);
}

function sleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason);
    };

    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
