import { afterAll, describe, expect, it } from 'bun:test';
import { RedisClient } from 'bun';
import { createJob } from '@/worker/job';
import { RedisStreamQueue } from '@/worker/queue';

const runRedisIntegration = process.env.RUN_REDIS_INTEGRATION === 'true';

if (!runRedisIntegration) {
  describe.skip('RedisStreamQueue — Redis integration', () => {
    it('requires RUN_REDIS_INTEGRATION=true', () => {});
  });
} else {
  describe('RedisStreamQueue — Redis integration', () => {
    const redisUrl = process.env.REDIS_URL!;
    const redis = new RedisClient(redisUrl);
    const suffix = crypto.randomUUID();
    const streamKey = `test:worker:${suffix}:stream`;
    const deadLetterKey = `test:worker:${suffix}:dead`;
    const groupName = `test-group-${suffix}`;
    const queue = new RedisStreamQueue(redis, {
      streamKey,
      deadLetterKey,
      groupName,
    });

    afterAll(async () => {
      await redis.del(streamKey, deadLetterKey);
      redis.close();
    });

    it('should enqueue, consume, and ack a job through a consumer group', async () => {
      await queue.ensureGroup();

      const job = createJob('test.echo', { value: 'hello' });
      await queue.enqueue(job);

      const message = await queue.read('consumer-1', 500);
      expect(message).not.toBeNull();

      const parsed = JSON.parse(message!.raw) as typeof job;
      expect(parsed.job_id).toBe(job.job_id);
      expect(parsed.payload).toEqual({ value: 'hello' });

      await queue.ack(message!.id);

      const next = await queue.read('consumer-1', 100);
      expect(next).toBeNull();
    });

    it('should move a failed job to the dead-letter stream', async () => {
      await queue.ensureGroup();

      const job = createJob('test.fail', { value: 1 });
      await queue.enqueue(job);

      const message = await queue.read('consumer-2', 500);
      expect(message).not.toBeNull();

      await queue.deadLetter(message!, 'intentional failure');

      const entries = await redis.send('XRANGE', [deadLetterKey, '-', '+']);
      expect(Array.isArray(entries)).toBe(true);
      expect((entries as unknown[]).length).toBeGreaterThan(0);
    });
  });
}
