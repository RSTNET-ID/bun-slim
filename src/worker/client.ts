import { RedisClient } from 'bun';
import { config } from '@/config';
import { logger } from '@/shared/logger';

let redisClient: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is required before using the Redis worker/queue pack');
  }

  if (!redisClient) {
    redisClient = new RedisClient(config.REDIS_URL, {
      connectionTimeout: config.REDIS_CONNECTION_TIMEOUT_MS,
      autoReconnect: true,
      maxRetries: config.REDIS_MAX_RETRIES,
      enableOfflineQueue: true,
      enableAutoPipelining: true,
    });

    redisClient.onconnect = () => {
      logger.info('Redis connection established');
    };

    redisClient.onclose = (error) => {
      logger.warn('Redis connection closed', {
        error: error instanceof Error ? error.message : error ? String(error) : undefined,
      });
    };
  }

  return redisClient;
}

export async function connectRedisClient(): Promise<RedisClient> {
  const client = getRedisClient();
  if (!client.connected) {
    await client.connect();
  }
  return client;
}

export function closeRedisClient(): void {
  if (!redisClient) return;
  redisClient.close();
  redisClient = null;
  logger.info('Redis connection closed');
}
