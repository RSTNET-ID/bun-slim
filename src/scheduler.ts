import { config } from '@/config';
import { closeDbClient } from '@/database/client';
import { logger } from '@/shared/logger';
import {
  ProcessHealthState,
  startProcessHealthServer,
  stopProcessHealthServer,
} from '@/shared/lifecycle/process-health';
import {
  startProcessMetricsServer,
  stopProcessMetricsServer,
} from '@/shared/observability/metrics-server';
import { closeRedisClient } from '@/worker/client';
import { scheduledTasks } from '@/scheduler/registry';
import { SchedulerRunner } from '@/scheduler/runner';

if (!config.SCHEDULER_ENABLED) {
  throw new Error('SCHEDULER_ENABLED=true is required to run the scheduler entrypoint');
}

const healthState = new ProcessHealthState();
const runner = new SchedulerRunner(scheduledTasks);
runner.start();
healthState.markReady();
const healthServer = startProcessHealthServer('scheduler', healthState);
const metricsServer = startProcessMetricsServer('scheduler');

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  healthState.markDraining();
  logger.info(`Received ${signal}. Draining scheduler...`);

  try {
    await runner.stop();
    await stopProcessHealthServer(healthServer);
    await stopProcessMetricsServer(metricsServer);
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
