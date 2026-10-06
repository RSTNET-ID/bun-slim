import { describe, expect, it } from 'bun:test';
import { isMetricsAuthorized } from '@/shared/observability/metrics-auth';

describe('isMetricsAuthorized', () => {
  const token = '0123456789abcdefghijklmn';

  it('fails closed when no metrics token is configured', () => {
    expect(isMetricsAuthorized(undefined, undefined)).toBe(false);
    expect(isMetricsAuthorized('Bearer anything', undefined)).toBe(false);
  });

  it('rejects missing or malformed authorization', () => {
    expect(isMetricsAuthorized(undefined, token)).toBe(false);
    expect(isMetricsAuthorized('Basic abc', token)).toBe(false);
    expect(isMetricsAuthorized('Bearer wrong', token)).toBe(false);
  });

  it('accepts only the exact bearer token', () => {
    expect(isMetricsAuthorized(`Bearer ${token}`, token)).toBe(true);
  });
});
