import { afterAll, describe, expect, it } from 'bun:test';
import { RedisClient } from 'bun';
import { createJob, parseJobEnvelope } from '@/worker/job';
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
    const purgeDeadLetterKey = `test:worker:${suffix}:purge-dead`;
    const groupName = `test-group-${suffix}`;
    const queue = new RedisStreamQueue(redis, {
      streamKey,
      deadLetterKey,
      groupName,
    });
    const purgeQueue = new RedisStreamQueue(redis, {
      streamKey: `test:worker:${suffix}:purge-stream`,
      deadLetterKey: purgeDeadLetterKey,
      groupName: `test-purge-group-${suffix}`,
    });

    afterAll(async () => {
      await redis.del(
        streamKey,
        deadLetterKey,
        purgeQueue.streamKey,
        purgeDeadLetterKey
      );
      redis.close();
    });

    it('should enqueue, consume, and ack a job through a consumer group', async () => {
      await queue.ensureGroup();

      const job = createJob('test.echo', { value: 'hello' });
      await queue.enqueue(job);

      const message = await queue.read('consumer-1', 500);
      expect(message).not.toBeNull();

      const parsed = parseJobEnvelope(message!.raw);
      expect(parsed.job_id).toBe(job.job_id);
      expect(parsed.payload).toEqual({ value: 'hello' });

      await queue.ack(message!.id);

      const next = await queue.read('consumer-1', 100);
      expect(next).toBeNull();
    });

    it('should inspect and atomically replay a dead-letter job', async () => {
      await queue.ensureGroup();

      const job = createJob('test.fail', { value: 1 });
      await queue.enqueue({ ...job, attempt: 3 });

      const message = await queue.read('consumer-2', 500);
      expect(message).not.toBeNull();

      await queue.deadLetter(message!, 'intentional failure');

      const entries = await queue.listDeadLetters(10);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.jobId).toBe(job.job_id);
      expect(entries[0]?.jobType).toBe('test.fail');
      expect(entries[0]?.attempt).toBe(3);

      const dlqId = entries[0]!.id;
      expect(await queue.getDeadLetter(dlqId)).not.toBeNull();

      const replayed = await queue.replayDeadLetter(dlqId);
      expect(replayed).not.toBeNull();
      expect(replayed?.job.job_id).toBe(job.job_id);
      expect(replayed?.job.attempt).toBe(1);
      expect(await queue.getDeadLetter(dlqId)).toBeNull();

      // A second operator cannot replay the same DLQ entry again.
      expect(await queue.replayDeadLetter(dlqId)).toBeNull();

      const replayedMessage = await queue.read('consumer-3', 500);
      expect(replayedMessage).not.toBeNull();

      const replayedJob = parseJobEnvelope(replayedMessage!.raw);
      expect(replayedJob.job_id).toBe(job.job_id);
      expect(replayedJob.attempt).toBe(1);

      await queue.ack(replayedMessage!.id);
    });

    it('should purge only dead-letter entries older than the cutoff', async () => {
      const oldTimestamp = Date.now() - 86_400_000;
      const recentJob = createJob('test.recent', { value: 'recent' });
      const oldJob = createJob('test.old', { value: 'old' });

      await redis.send('XADD', [
        purgeDeadLetterKey,
        `${oldTimestamp}-0`,
        'original_stream_id',
        '1-0',
        'failed_at',
        new Date(oldTimestamp).toISOString(),
        'reason',
        'old failure',
        'payload',
        JSON.stringify(oldJob),
      ]);

      const recentId = String(
        await redis.send('XADD', [
          purgeDeadLetterKey,
          '*',
          'original_stream_id',
          '2-0',
          'failed_at',
          new Date().toISOString(),
          'reason',
          'recent failure',
          'payload',
          JSON.stringify(recentJob),
        ])
      );

      const deleted = await purgeQueue.purgeDeadLettersBefore(
        new Date(Date.now() - 3_600_000),
        10
      );

      expect(deleted).toBe(1);
      expect(await purgeQueue.getDeadLetter(`${oldTimestamp}-0`)).toBeNull();
      expect(await purgeQueue.getDeadLetter(recentId)).not.toBeNull();
    });
  });
}
