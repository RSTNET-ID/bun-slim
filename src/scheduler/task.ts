export interface ScheduledTaskContext {
  scheduledAt: Date;
  signal: AbortSignal;
}

export interface ScheduledTask {
  name: string;
  cron: string;
  run(context: ScheduledTaskContext): Promise<void>;
}
