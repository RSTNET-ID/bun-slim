export interface ScheduledTaskContext {
  scheduledAt: Date;
  timezone: string;
  signal: AbortSignal;
}

export interface ScheduledTask {
  name: string;
  cron: string;
  timezone?: string;
  run(context: ScheduledTaskContext): Promise<void>;
}
