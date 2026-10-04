import { describe, expect, it } from 'bun:test';
import { validateScheduledTasks } from '@/scheduler/runner';
import type { ScheduledTask } from '@/scheduler/task';

const noop = async () => {};

describe('scheduler task validation', () => {
  it('accepts a valid UTC cron task', () => {
    const tasks: ScheduledTask[] = [
      {
        name: 'hourly-maintenance',
        cron: '@hourly',
        run: noop,
      },
    ];

    expect(() => validateScheduledTasks(tasks)).not.toThrow();
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
