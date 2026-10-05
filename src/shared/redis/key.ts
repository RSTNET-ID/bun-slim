const REDIS_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REDIS_NAMESPACE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function isRedisKeySegment(value: string): boolean {
  return value.length <= 64 && REDIS_KEY_SEGMENT_PATTERN.test(value);
}

export function isRedisNamespace(value: string): boolean {
  return value.length <= 192 && REDIS_NAMESPACE_PATTERN.test(value);
}

export function resolveRedisNamespace(
  serviceName: string,
  appEnv: string,
  configuredNamespace?: string
): string {
  const namespace = configuredNamespace ?? `${serviceName}:${appEnv}`;

  if (!isRedisNamespace(namespace)) {
    throw new Error(
      'REDIS_NAMESPACE must contain colon-separated Redis-safe segments using letters, numbers, dot, underscore, or hyphen'
    );
  }

  return namespace;
}

export function redisKey(namespace: string, ...segments: string[]): string {
  if (!isRedisNamespace(namespace)) {
    throw new Error('Invalid Redis namespace');
  }

  for (const segment of segments) {
    if (!isRedisKeySegment(segment)) {
      throw new Error(`Invalid Redis key segment: ${segment}`);
    }
  }

  return [namespace, ...segments].join(':');
}
