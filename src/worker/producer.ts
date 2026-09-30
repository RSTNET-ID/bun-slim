import { config } from '@/config';
import { getRedisClient } from './client';
import { createJob } from './job';
import { RedisStreamQueue } from './queue';

let queue: RedisStreamQueue | null = null;

function getQueue(): RedisStreamQueue {
  queue ??= new RedisStreamQueue(getRedisClient());
  return queue;
}

export async function enqueueJob<TPayload>(
  jobType: string,
  payload: TPayload,
  options: {
    requestId?: string;
    version?: number;
  } = {}
): Promise<string> {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is required to enqueue background jobs');
  }

  return await getQueue().enqueue(createJob(jobType, payload, options));
}
