import { hostname } from 'node:os';
import { config } from '@/config';
import { closeDbClient } from '@/database/client';
import { logger } from '@/shared/logger';
import {
  startProcessMetricsServer,
  stopProcessMetricsServer,
} from '@/shared/observability/metrics-server';
import { closeRedisClient, connectRedisClient } from '@/worker/client';
import { RedisStreamQueue } from '@/worker/queue';
import { jobHandlers } from '@/worker/registry';
import { WorkerRunner } from '@/worker/runner';

if (!config.WORKER_ENABLED) {
  throw new Error('WORKER_ENABLED=true is required to run the worker entrypoint');
}

const workerId = `${hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
const redis = await connectRedisClient();
const queue = new RedisStreamQueue(redis);
const runner = new WorkerRunner(queue, {
  workerId,
  handlers: jobHandlers,
});
const metricsServer = startProcessMetricsServer('worker');

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Draining worker...`, {
    worker_id: workerId,
  });

  runner.stop();
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await runner.run();
} finally {
  await stopProcessMetricsServer(metricsServer);
  closeRedisClient();
  await closeDbClient();
  logger.info('Worker stopped', { worker_id: workerId });
}
