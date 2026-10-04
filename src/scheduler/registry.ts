import type { ScheduledTask } from './task';

/**
 * Register service-specific schedules here.
 *
 * Keep callbacks small. Prefer enqueueing a durable background job and let the
 * worker own retries, idempotency, timeout, and dead-letter handling.
 *
 * Example:
 *
 * export const scheduledTasks: ScheduledTask[] = [
 *   {
 *     name: 'notification-digest',
 *     cron: '0 8 * * *',
 *     timezone: 'Asia/Jakarta',
 *     async run() {
 *       await enqueueJob('notification.digest', {});
 *     },
 *   },
 * ];
 */
export const scheduledTasks: ScheduledTask[] = [];
