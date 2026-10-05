import { describe, expect, it } from 'bun:test';
import { buildRedisQueueNames } from '@/worker/queue';

describe('Redis queue namespacing', () => {
  it('namespaces stream, dead letter, and consumer group consistently', () => {
    expect(buildRedisQueueNames('artavax:production', 'default')).toEqual({
      streamKey: 'artavax:production:queue:default:stream',
      deadLetterKey: 'artavax:production:queue:default:dead',
      groupName: 'artavax:production:queue:default:workers',
    });
  });

  it('supports deployment-specific namespace overrides', () => {
    expect(buildRedisQueueNames('artavax:production:idc1', 'settlement')).toEqual({
      streamKey: 'artavax:production:idc1:queue:settlement:stream',
      deadLetterKey: 'artavax:production:idc1:queue:settlement:dead',
      groupName: 'artavax:production:idc1:queue:settlement:workers',
    });
  });
});
