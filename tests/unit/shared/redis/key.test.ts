import { describe, expect, it } from 'bun:test';
import {
  isRedisKeySegment,
  isRedisNamespace,
  redisKey,
  resolveRedisNamespace,
} from '@/shared/redis/key';

describe('Redis key namespace', () => {
  it('derives namespace from service and environment', () => {
    expect(resolveRedisNamespace('artavax', 'production')).toBe('artavax:production');
  });

  it('supports an explicit deployment namespace', () => {
    expect(resolveRedisNamespace('artavax', 'production', 'artavax:production:idc1')).toBe(
      'artavax:production:idc1'
    );
  });

  it('builds namespaced Redis keys', () => {
    expect(redisKey('artavax:production', 'queue', 'default', 'stream')).toBe(
      'artavax:production:queue:default:stream'
    );
  });

  it('rejects ambiguous or unsafe key segments', () => {
    expect(isRedisKeySegment('default')).toBe(true);
    expect(isRedisKeySegment('queue:name')).toBe(false);
    expect(isRedisNamespace('artavax:production')).toBe(true);
    expect(isRedisNamespace('artavax::production')).toBe(false);
    expect(() => redisKey('artavax:production', 'queue:name')).toThrow(
      'Invalid Redis key segment'
    );
  });
});
