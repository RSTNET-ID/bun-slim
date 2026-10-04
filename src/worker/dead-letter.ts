import { parseJobEnvelope } from './job';
import type { DeadLetterEntry } from './queue';

const DURATION_UNITS_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export interface DeadLetterSummary {
  id: string;
  original_stream_id: string | null;
  failed_at: string | null;
  reason: string | null;
  job_id: string | null;
  job_type: string | null;
  attempt: number | null;
}

export function parseDurationMs(value: string): number {
  const match = /^([1-9]\d*)(s|m|h|d|w)$/i.exec(value.trim());
  if (!match) {
    throw new Error('Duration must use a positive integer with s, m, h, d, or w (example: 30d)');
  }

  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multiplier = DURATION_UNITS_MS[unit]!;
  const durationMs = amount * multiplier;

  if (!Number.isSafeInteger(durationMs)) {
    throw new Error('Duration is too large');
  }

  return durationMs;
}

export function summarizeDeadLetter(entry: DeadLetterEntry): DeadLetterSummary {
  let jobId = entry.jobId;
  let jobType = entry.jobType;
  let attempt = entry.attempt;

  if ((!jobId || !jobType || attempt === null) && entry.rawPayload) {
    try {
      const job = parseJobEnvelope(entry.rawPayload);
      jobId ??= job.job_id;
      jobType ??= job.job_type;
      attempt ??= job.attempt;
    } catch {
      // Malformed DLQ payloads remain inspectable even when job metadata cannot be recovered.
    }
  }

  return {
    id: entry.id,
    original_stream_id: entry.originalStreamId,
    failed_at: entry.failedAt,
    reason: compactText(entry.reason),
    job_id: jobId,
    job_type: jobType,
    attempt,
  };
}

function compactText(value: string | null, maxLength = 160): string | null {
  if (!value) return value;

  const compacted = value.replace(/\s+/g, ' ').trim();
  if (compacted.length <= maxLength) return compacted;

  return `${compacted.slice(0, maxLength - 1)}…`;
}
