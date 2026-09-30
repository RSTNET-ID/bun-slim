import type { JobHandlerRegistry } from './job';

/**
 * Register service-specific job handlers here.
 *
 * Example:
 *   export const jobHandlers: JobHandlerRegistry = {
 *     'notification.send': async (job, { signal }) => {
 *       await notificationService.send(job.payload, { signal });
 *     },
 *   };
 */
export const jobHandlers: JobHandlerRegistry = {};
