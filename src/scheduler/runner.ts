import { config } from '@/config';
import { logger } from '@/shared/logger';
import type { ScheduledTask } from './task';

const SCHEDULE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function validateScheduledTasks(tasks: ScheduledTask[]): void {
  const names = new Set<string>();

  for (const task of tasks) {
    if (!SCHEDULE_NAME_PATTERN.test(task.name)) {
      throw new Error(
        `Invalid scheduler task name "${task.name}". Use lowercase letters, numbers, dot, underscore, or dash.`
      );
    }

    if (names.has(task.name)) {
      throw new Error(`Duplicate scheduler task name: ${task.name}`);
    }
    names.add(task.name);

    const next = Bun.cron.parse(task.cron, Date.now(), { tz: config.TZ });
    if (!next) {
      throw new Error(`Scheduler task "${task.name}" has no future run: ${task.cron}`);
    }
  }
}

export class SchedulerRunner {
  private readonly jobs: Bun.CronJob[] = [];
  private readonly activeRuns = new Set<Promise<void>>();
  private readonly activeControllers = new Set<AbortController>();
  private stopping = false;

  constructor(private readonly tasks: ScheduledTask[]) {}

  start(): void {
    if (this.tasks.length === 0) {
      throw new Error(
        'No scheduler tasks registered. Add tasks in src/scheduler/registry.ts before enabling SCHEDULER_ENABLED.'
      );
    }

    validateScheduledTasks(this.tasks);

    for (const task of this.tasks) {
      const next = Bun.cron.parse(task.cron, Date.now(), { tz: config.TZ });
      const job = Bun.cron(
        task.cron,
        async () => {
          await this.execute(task);
        },
        { tz: config.TZ }
      );

      this.jobs.push(job);

      logger.info('Scheduler task registered', {
        task: task.name,
        cron: task.cron,
        timezone: config.TZ,
        next_run_at: next?.toISOString(),
      });
    }

    logger.info('Scheduler started', {
      task_count: this.jobs.length,
      timezone: config.TZ,
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    for (const job of this.jobs) job.stop();
    for (const controller of this.activeControllers) controller.abort();

    if (this.activeRuns.size === 0) return;

    const activeRuns = Promise.allSettled([...this.activeRuns]);
    const timeout = Bun.sleep(config.SHUTDOWN_TIMEOUT_MS).then(() => 'timeout' as const);
    const result = await Promise.race([activeRuns, timeout]);

    if (result === 'timeout') {
      logger.error('Scheduler shutdown deadline exceeded', {
        active_tasks: this.activeRuns.size,
        shutdown_timeout_ms: config.SHUTDOWN_TIMEOUT_MS,
      });
    }
  }

  private async execute(task: ScheduledTask): Promise<void> {
    if (this.stopping) return;

    const controller = new AbortController();
    const scheduledAt = new Date();
    const startedAt = performance.now();
    const run = this.runTask(task, controller, scheduledAt, startedAt);

    this.activeControllers.add(controller);
    this.activeRuns.add(run);

    try {
      await run;
    } finally {
      this.activeControllers.delete(controller);
      this.activeRuns.delete(run);
    }
  }

  private async runTask(
    task: ScheduledTask,
    controller: AbortController,
    scheduledAt: Date,
    startedAt: number
  ): Promise<void> {
    try {
      await task.run({
        scheduledAt,
        signal: controller.signal,
      });

      logger.info('Scheduler task completed', {
        task: task.name,
        cron: task.cron,
        scheduled_at: scheduledAt.toISOString(),
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (error: unknown) {
      logger.error('Scheduler task failed', {
        task: task.name,
        cron: task.cron,
        scheduled_at: scheduledAt.toISOString(),
        duration_ms: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
