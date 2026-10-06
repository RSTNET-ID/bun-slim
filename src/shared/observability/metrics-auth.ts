import { timingSafeEqual } from 'node:crypto';

export function isMetricsAuthorized(
  authorization: string | null | undefined,
  token: string | undefined
): boolean {
  if (!token) return false;
  if (!authorization) return false;

  const expected = `Bearer ${token}`;
  const actualBytes = Buffer.from(authorization);
  const expectedBytes = Buffer.from(expected);

  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}
