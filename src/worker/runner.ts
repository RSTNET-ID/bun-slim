import { config } from '@/config';
import { logger } from '@/shared/logger';
import type { JobEnvelope, JobHandlerRegistry } from './job';
import type { RedisStreamMessage } from './queue';
import { RedisStreamQueue } from './queue';

export interface WorkerRunnerOptions {
  workerId: string;
  handlers: JobHandlerRegistry;
}

export class WorkerRunner {
  private stopping = false;
  private runningJobs = 0;

  constructor(
    private readonly queue: RedisStreamQueue,
    private readonly options: WorkerRunnerOptions
  ) {}

  async run(): Promise<void> {
    await this.queue.ensureGroup();

    logger.info('Worker started', {
      worker_id: this.options.workerId,
      queue: this.queue.streamKey,
      concurrency: config.WORKER_CONCURRENCY,
    });

    const consumers = Array.from({ length: config.WORKER_CONCURRENCY }, (_, index) =>
      this.consumeLoop(`${this.options.workerId}:${index + 1}`)
    );

    await Promise.all([...consumers, this.reclaimLoop()]);
  }

  stop(): void {
    this.stopping = true;
    logger.info('Worker stop requested', {
      worker_id: this.options.workerId,
      running_jobs: this.runningJobs,
    });
  }

  private async consumeLoop(consumerName: string): Promise<void> {
    while (!this.stopping) {
      try {
        const message = await this.queue.read(consumerName, config.WORKER_BLOCK_MS);
        if (!message || this.stopping) continue;
        await this.handleMessage(message);
      } catch (error: unknown) {
        if (this.stopping) break;
        logger.error('Worker consume loop failed', {
          consumer: consumerName,
          error: toErrorMessage(error),
        });
        await sleep(500);
      }
    }
  }

  private async reclaimLoop(): Promise<void> {
    const consumerName = `${this.options.workerId}:reclaimer`;

    while (!this.stopping) {
      await sleep(config.WORKER_RECLAIM_INTERVAL_MS);
      if (this.stopping) break;

      try {
        const messages = await this.queue.claimStale(
          consumerName,
          config.WORKER_STALE_AFTER_MS,
          config.WORKER_CONCURRENCY
        );

        for (const message of messages) {
          if (this.stopping) break;
          logger.warn('Reclaimed stale job', {
            worker_id: this.options.workerId,
            stream_id: message.id,
          });
          await this.handleMessage(message);
        }
      } catch (error: unknown) {
        logger.error('Worker stale-job reclaim failed', {
          error: toErrorMessage(error),
        });
      }
    }
  }

  private async handleMessage(message: RedisStreamMessage): Promise<void> {
    let job: JobEnvelope;

    try {
      job = parseJob(message.raw);
    } catch (error: unknown) {
      const reason = `INVALID_JOB_PAYLOAD: ${toErrorMessage(error)}`;
      logger.error('Invalid worker job payload', {
        stream_id: message.id,
        error: reason,
      });
      await this.queue.deadLetter(message, reason);
      return;
    }

    const handler = this.options.handlers[job.job_type];
    if (!handler) {
      const reason = `UNKNOWN_JOB_TYPE: ${job.job_type}`;
      logger.error('No worker handler registered', {
        job_id: job.job_id,
        job_type: job.job_type,
      });
      await this.queue.deadLetter(message, reason);
      return;
    }

    this.runningJobs += 1;
    const startedAt = performance.now();

    try {
      await runWithTimeout(
        (signal) => handler(job, { signal }),
        config.WORKER_JOB_TIMEOUT_MS
      );

      await this.queue.ack(message.id);

      logger.info('Worker job completed', {
        job_id: job.job_id,
        job_type: job.job_type,
        request_id: job.request_id,
        attempt: job.attempt,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error);

      if (job.attempt >= config.WORKER_MAX_ATTEMPTS) {
        await this.queue.deadLetter(message, errorMessage);

        logger.error('Worker job moved to dead letter', {
          job_id: job.job_id,
          job_type: job.job_type,
          request_id: job.request_id,
          attempt: job.attempt,
          error: errorMessage,
        });
        return;
      }

      const delayMs = retryDelayMs(job.attempt);

      logger.warn('Worker job failed; retry scheduled', {
        job_id: job.job_id,
        job_type: job.job_type,
        request_id: job.request_id,
        attempt: job.attempt,
        retry_in_ms: delayMs,
        error: errorMessage,
      });

      const shouldRetry = await sleepUntilRetry(delayMs, () => this.stopping);
      if (!shouldRetry) {
        // Leave the message pending. Another consumer can reclaim it later.
        return;
      }

      await this.queue.retry(message, {
        ...job,
        attempt: job.attempt + 1,
      });
    } finally {
      this.runningJobs -= 1;
    }
  }
}

function parseJob(raw: string): JobEnvelope {
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Job payload must be an object');
  }

  const job = parsed as Partial<JobEnvelope>;

  if (
    typeof job.job_id !== 'string' ||
    typeof job.job_type !== 'string' ||
    typeof job.version !== 'number' ||
    typeof job.created_at !== 'string' ||
    typeof job.attempt !== 'number' ||
    !('payload' in job)
  ) {
    throw new Error('Job envelope is missing required fields');
  }

  return job as JobEnvelope;
}

function retryDelayMs(attempt: number): number {
  const multiplier = Math.max(1, 2 ** Math.max(0, attempt - 1));
  return Math.min(config.WORKER_RETRY_BACKOFF_MS * multiplier, 30_000);
}

async function runWithTimeout(
  handler: (signal: AbortSignal) => Promise<void>,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Job timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([handler(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sleepUntilRetry(
  delayMs: number,
  isStopping: () => boolean
): Promise<boolean> {
  const stepMs = 250;
  let remaining = delayMs;

  while (remaining > 0) {
    if (isStopping()) return false;
    const current = Math.min(stepMs, remaining);
    await sleep(current);
    remaining -= current;
  }

  return !isStopping();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
