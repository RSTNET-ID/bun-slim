import { describe, expect, it } from 'bun:test';
import { parseDurationMs, summarizeDeadLetter } from '@/worker/dead-letter';
import { createJob } from '@/worker/job';

describe('dead-letter operational helpers', () => {
  it('parses bounded retention durations', () => {
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('15m')).toBe(900_000);
    expect(parseDurationMs('2h')).toBe(7_200_000);
    expect(parseDurationMs('30d')).toBe(2_592_000_000);
    expect(parseDurationMs('2w')).toBe(1_209_600_000);
  });

  it('rejects invalid retention durations', () => {
    expect(() => parseDurationMs('0d')).toThrow();
    expect(() => parseDurationMs('30days')).toThrow();
    expect(() => parseDurationMs('-1h')).toThrow();
  });

  it('recovers job metadata from legacy DLQ payloads', () => {
    const job = createJob('notification.send', { notification_id: 'n-1' });
    const summary = summarizeDeadLetter({
      id: '1000-0',
      originalStreamId: '900-0',
      failedAt: '2026-10-05T00:00:00.000Z',
      reason: 'provider timeout',
      rawPayload: JSON.stringify(job),
      jobId: null,
      jobType: null,
      attempt: null,
    });

    expect(summary.job_id).toBe(job.job_id);
    expect(summary.job_type).toBe('notification.send');
    expect(summary.attempt).toBe(1);
  });

  it('compacts long multiline failure reasons', () => {
    const summary = summarizeDeadLetter({
      id: '1000-0',
      originalStreamId: null,
      failedAt: null,
      reason: `line one\n${'x'.repeat(200)}`,
      rawPayload: null,
      jobId: null,
      jobType: null,
      attempt: null,
    });

    expect(summary.reason).not.toContain('\n');
    expect(summary.reason!.length).toBeLessThanOrEqual(160);
  });
});
