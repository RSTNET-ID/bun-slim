export interface JobEnvelope<TPayload = unknown> {
  job_id: string;
  job_type: string;
  version: number;
  created_at: string;
  attempt: number;
  payload: TPayload;
  request_id?: string;
}

export interface JobHandlerContext {
  signal: AbortSignal;
}

export type JobHandler<TPayload = unknown> = (
  job: JobEnvelope<TPayload>,
  context: JobHandlerContext
) => Promise<void>;

export type JobHandlerRegistry = Record<string, JobHandler>;

export function createJob<TPayload>(
  jobType: string,
  payload: TPayload,
  options: {
    requestId?: string;
    version?: number;
  } = {}
): JobEnvelope<TPayload> {
  return {
    job_id: crypto.randomUUID(),
    job_type: jobType,
    version: options.version ?? 1,
    created_at: new Date().toISOString(),
    attempt: 1,
    payload,
    ...(options.requestId ? { request_id: options.requestId } : {}),
  };
}

export function parseJobEnvelope(raw: string): JobEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Job payload must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Job payload must be an object');
  }

  const job = parsed as Partial<JobEnvelope>;

  if (typeof job.job_id !== 'string' || job.job_id.length === 0) {
    throw new Error('Job envelope has invalid job_id');
  }

  if (typeof job.job_type !== 'string' || job.job_type.length === 0) {
    throw new Error('Job envelope has invalid job_type');
  }

  if (!Number.isInteger(job.version) || (job.version ?? 0) < 1) {
    throw new Error('Job envelope has invalid version');
  }

  if (typeof job.created_at !== 'string' || Number.isNaN(Date.parse(job.created_at))) {
    throw new Error('Job envelope has invalid created_at');
  }

  if (!Number.isInteger(job.attempt) || (job.attempt ?? 0) < 1) {
    throw new Error('Job envelope has invalid attempt');
  }

  if (!('payload' in job)) {
    throw new Error('Job envelope is missing payload');
  }

  if (job.request_id !== undefined && typeof job.request_id !== 'string') {
    throw new Error('Job envelope has invalid request_id');
  }

  return job as JobEnvelope;
}
