import { describe, expect, it } from 'bun:test';
import { validateScheduledTasks } from '@/scheduler/runner';
import type { ScheduledTask } from '@/scheduler/task';

const noop = async () => {};

describe('scheduler task validation', () => {
  it('accepts a task using the default scheduler timezone', () => {
    const tasks: ScheduledTask[] = [
      {
        name: 'hourly-maintenance',
        cron: '@hourly',
        run: noop,
      },
    ];

    expect(() => validateScheduledTasks(tasks)).not.toThrow();
  });

  it('accepts an explicit IANA timezone override', () => {
    const tasks: ScheduledTask[] = [
      {
        name: 'jakarta-daily',
        cron: '0 1 * * *',
        timezone: 'Asia/Jakarta',
        run: noop,
      },
    ];

    expect(() => validateScheduledTasks(tasks)).not.toThrow();
  });

  it('rejects an invalid timezone override', () => {
    const tasks: ScheduledTask[] = [
      {
        name: 'invalid-timezone',
        cron: '@daily',
        timezone: 'Mars/Olympus_Mons',
        run: noop,
      },
    ];

    expect(() => validateScheduledTasks(tasks)).toThrow();
  });

  it('rejects duplicate task names', () => {
    const tasks: ScheduledTask[] = [
      { name: 'duplicate', cron: '@hourly', run: noop },
      { name: 'duplicate', cron: '@daily', run: noop },
    ];

    expect(() => validateScheduledTasks(tasks)).toThrow('Duplicate scheduler task name');
  });

  it('rejects invalid task names', () => {
    const tasks: ScheduledTask[] = [
      { name: 'Bad Task Name', cron: '@hourly', run: noop },
    ];

    expect(() => validateScheduledTasks(tasks)).toThrow('Invalid scheduler task name');
  });

  it('rejects invalid cron expressions', () => {
    const tasks: ScheduledTask[] = [
      { name: 'invalid-cron', cron: 'not a cron', run: noop },
    ];

    expect(() => validateScheduledTasks(tasks)).toThrow();
  });
});
