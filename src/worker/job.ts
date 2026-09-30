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
