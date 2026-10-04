import { config } from '@/config';
import { closeDbClient } from '@/database/client';
import { logger } from '@/shared/logger';
import { closeRedisClient } from '@/worker/client';
import { scheduledTasks } from '@/scheduler/registry';
import { SchedulerRunner } from '@/scheduler/runner';

if (!config.SCHEDULER_ENABLED) {
  throw new Error('SCHEDULER_ENABLED=true is required to run the scheduler entrypoint');
}

const runner = new SchedulerRunner(scheduledTasks);
runner.start();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Draining scheduler...`);

  try {
    await runner.stop();
    closeRedisClient();
    await closeDbClient();
    logger.info('Scheduler stopped');
    process.exit(0);
  } catch (error: unknown) {
    logger.error('Scheduler shutdown failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
