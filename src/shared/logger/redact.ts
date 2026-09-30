const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(authorization|proxy_authorization|cookie|set_cookie|password|passwd|pwd|secret|token|api_key|apikey|access_key|private_key|client_secret|database_url|redis_url)($|[_-])/i;

const CREDENTIAL_URL_PATTERN = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/i;

export function redactLogValue(
  value: unknown,
  key?: string,
  seen = new WeakSet<object>()
): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(normalizeKey(key))) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return redactCredentialUrl(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactCredentialUrl(value.message),
      stack: value.stack ? redactCredentialUrl(value.stack) : undefined,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const output = value.map((item) => redactLogValue(item, undefined, seen));
      seen.delete(value);
      return output;
    }

    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = redactLogValue(entryValue, entryKey, seen);
    }

    seen.delete(value);
    return output;
  }

  return String(value);
}

export function redactLogContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!context) return undefined;

  return redactLogValue(context) as Record<string, unknown>;
}

function normalizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function redactCredentialUrl(value: string): string {
  return value.replace(CREDENTIAL_URL_PATTERN, '$1[REDACTED]@');
}

export { REDACTED };
