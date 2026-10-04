import { describe, expect, it } from 'bun:test';
import { createJob, parseJobEnvelope } from '@/worker/job';

describe('job envelope parsing', () => {
  it('parses a valid job envelope', () => {
    const job = createJob('test.echo', { value: 1 }, { requestId: 'req-1', version: 2 });

    expect(parseJobEnvelope(JSON.stringify(job))).toEqual(job);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseJobEnvelope('{bad json')).toThrow('valid JSON');
  });

  it('rejects invalid attempts and versions', () => {
    const base = createJob('test.echo', { value: 1 });

    expect(() =>
      parseJobEnvelope(JSON.stringify({ ...base, attempt: 0 }))
    ).toThrow('invalid attempt');

    expect(() =>
      parseJobEnvelope(JSON.stringify({ ...base, version: 0 }))
    ).toThrow('invalid version');
  });

  it('rejects invalid timestamps', () => {
    const job = createJob('test.echo', { value: 1 });

    expect(() =>
      parseJobEnvelope(JSON.stringify({ ...job, created_at: 'not-a-date' }))
    ).toThrow('invalid created_at');
  });
});
