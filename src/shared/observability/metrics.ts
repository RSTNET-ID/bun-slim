function sanitizeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labelString(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${sanitizeLabelValue(value)}"`).join(',')}}`;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

type WorkerResult = 'success' | 'retry' | 'dead_letter' | 'invalid_payload' | 'unknown_type';
type SchedulerResult = 'success' | 'error';

export class ServiceMetrics {
  private httpInFlight = 0;
  private workerInFlight = 0;
  private schedulerInFlight = 0;
  private workerReclaimed = 0;

  private readonly httpRequests = new Map<string, number>();
  private readonly httpDurationMs = new Map<string, { count: number; sum: number }>();
  private readonly outboundRequests = new Map<string, number>();
  private readonly outboundDurationMs = new Map<string, { count: number; sum: number }>();
  private readonly workerJobs = new Map<string, number>();
  private readonly workerDurationMs = new Map<string, { count: number; sum: number }>();
  private readonly schedulerRuns = new Map<string, number>();
  private readonly schedulerDurationMs = new Map<string, { count: number; sum: number }>();

  httpRequestStarted(): void {
    this.httpInFlight += 1;
  }

  recordHttpRequest(method: string, status: number, durationMs: number): void {
    this.httpInFlight = Math.max(0, this.httpInFlight - 1);
    const normalizedMethod = method.toUpperCase();
    const klass = statusClass(status);
    const key = `${normalizedMethod}|${klass}`;

    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);

    const current = this.httpDurationMs.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += durationMs;
    this.httpDurationMs.set(key, current);
  }

  recordOutboundRequest(
    dependency: string,
    method: string,
    status: number | 'network_error',
    durationMs: number
  ): void {
    const normalizedDependency = dependency || 'unknown';
    const normalizedMethod = method.toUpperCase();
    const normalizedStatus = typeof status === 'number' ? statusClass(status) : status;
    const key = `${normalizedDependency}|${normalizedMethod}|${normalizedStatus}`;

    this.outboundRequests.set(key, (this.outboundRequests.get(key) ?? 0) + 1);

    const current = this.outboundDurationMs.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += durationMs;
    this.outboundDurationMs.set(key, current);
  }

  workerJobStarted(): void {
    this.workerInFlight += 1;
  }

  workerJobFinished(jobType: string, result: WorkerResult, durationMs: number): void {
    this.workerInFlight = Math.max(0, this.workerInFlight - 1);
    this.recordWorkerOutcome(jobType, result, durationMs);
  }

  recordWorkerRejected(result: 'invalid_payload' | 'unknown_type'): void {
    this.recordWorkerOutcome(result === 'invalid_payload' ? 'invalid' : 'unknown', result, 0);
  }

  recordWorkerReclaimed(count = 1): void {
    this.workerReclaimed += Math.max(0, Math.floor(count));
  }

  schedulerTaskStarted(): void {
    this.schedulerInFlight += 1;
  }

  schedulerTaskFinished(task: string, result: SchedulerResult, durationMs: number): void {
    this.schedulerInFlight = Math.max(0, this.schedulerInFlight - 1);
    const key = `${task}|${result}`;

    this.schedulerRuns.set(key, (this.schedulerRuns.get(key) ?? 0) + 1);

    const current = this.schedulerDurationMs.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += durationMs;
    this.schedulerDurationMs.set(key, current);
  }

  renderPrometheus(component = 'http'): string {
    const lines: string[] = [
      '# HELP service_process_info Process identity.',
      '# TYPE service_process_info gauge',
      `service_process_info${labelString({ component })} 1`,
      '# HELP service_http_requests_in_flight Current in-flight HTTP requests.',
      '# TYPE service_http_requests_in_flight gauge',
      `service_http_requests_in_flight ${this.httpInFlight}`,
      '# HELP service_http_requests_total Total HTTP requests grouped by method and status class.',
      '# TYPE service_http_requests_total counter',
    ];

    for (const [key, value] of this.httpRequests) {
      const [method, status] = key.split('|') as [string, string];
      lines.push(`service_http_requests_total${labelString({ method, status })} ${value}`);
    }

    lines.push(
      '# HELP service_http_request_duration_seconds HTTP request duration summary.',
      '# TYPE service_http_request_duration_seconds summary'
    );

    for (const [key, value] of this.httpDurationMs) {
      const [method, status] = key.split('|') as [string, string];
      const labels = { method, status };
      lines.push(
        `service_http_request_duration_seconds_count${labelString(labels)} ${value.count}`,
        `service_http_request_duration_seconds_sum${labelString(labels)} ${value.sum / 1000}`
      );
    }

    lines.push(
      '# HELP service_outbound_http_requests_total Total outbound HTTP attempts.',
      '# TYPE service_outbound_http_requests_total counter'
    );

    for (const [key, value] of this.outboundRequests) {
      const [dependency, method, status] = key.split('|') as [string, string, string];
      lines.push(
        `service_outbound_http_requests_total${labelString({ dependency, method, status })} ${value}`
      );
    }

    lines.push(
      '# HELP service_outbound_http_request_duration_seconds Outbound HTTP duration summary.',
      '# TYPE service_outbound_http_request_duration_seconds summary'
    );

    for (const [key, value] of this.outboundDurationMs) {
      const [dependency, method, status] = key.split('|') as [string, string, string];
      const labels = { dependency, method, status };
      lines.push(
        `service_outbound_http_request_duration_seconds_count${labelString(labels)} ${value.count}`,
        `service_outbound_http_request_duration_seconds_sum${labelString(labels)} ${value.sum / 1000}`
      );
    }

    lines.push(
      '# HELP service_worker_jobs_in_flight Current worker jobs executing.',
      '# TYPE service_worker_jobs_in_flight gauge',
      `service_worker_jobs_in_flight ${this.workerInFlight}`,
      '# HELP service_worker_jobs_total Worker job outcomes.',
      '# TYPE service_worker_jobs_total counter'
    );

    for (const [key, value] of this.workerJobs) {
      const [jobType, result] = key.split('|') as [string, string];
      lines.push(
        `service_worker_jobs_total${labelString({ job_type: jobType, result })} ${value}`
      );
    }

    lines.push(
      '# HELP service_worker_job_duration_seconds Worker job duration summary.',
      '# TYPE service_worker_job_duration_seconds summary'
    );

    for (const [key, value] of this.workerDurationMs) {
      const [jobType, result] = key.split('|') as [string, string];
      const labels = { job_type: jobType, result };
      lines.push(
        `service_worker_job_duration_seconds_count${labelString(labels)} ${value.count}`,
        `service_worker_job_duration_seconds_sum${labelString(labels)} ${value.sum / 1000}`
      );
    }

    lines.push(
      '# HELP service_worker_reclaimed_total Stale Redis Stream jobs reclaimed.',
      '# TYPE service_worker_reclaimed_total counter',
      `service_worker_reclaimed_total ${this.workerReclaimed}`,
      '# HELP service_scheduler_tasks_in_flight Current scheduler callbacks executing.',
      '# TYPE service_scheduler_tasks_in_flight gauge',
      `service_scheduler_tasks_in_flight ${this.schedulerInFlight}`,
      '# HELP service_scheduler_runs_total Scheduler task outcomes.',
      '# TYPE service_scheduler_runs_total counter'
    );

    for (const [key, value] of this.schedulerRuns) {
      const [task, result] = key.split('|') as [string, string];
      lines.push(
        `service_scheduler_runs_total${labelString({ task, result })} ${value}`
      );
    }

    lines.push(
      '# HELP service_scheduler_run_duration_seconds Scheduler task duration summary.',
      '# TYPE service_scheduler_run_duration_seconds summary'
    );

    for (const [key, value] of this.schedulerDurationMs) {
      const [task, result] = key.split('|') as [string, string];
      const labels = { task, result };
      lines.push(
        `service_scheduler_run_duration_seconds_count${labelString(labels)} ${value.count}`,
        `service_scheduler_run_duration_seconds_sum${labelString(labels)} ${value.sum / 1000}`
      );
    }

    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.httpInFlight = 0;
    this.workerInFlight = 0;
    this.schedulerInFlight = 0;
    this.workerReclaimed = 0;
    this.httpRequests.clear();
    this.httpDurationMs.clear();
    this.outboundRequests.clear();
    this.outboundDurationMs.clear();
    this.workerJobs.clear();
    this.workerDurationMs.clear();
    this.schedulerRuns.clear();
    this.schedulerDurationMs.clear();
  }

  private recordWorkerOutcome(jobType: string, result: WorkerResult, durationMs: number): void {
    const key = `${jobType}|${result}`;
    this.workerJobs.set(key, (this.workerJobs.get(key) ?? 0) + 1);

    const current = this.workerDurationMs.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += durationMs;
    this.workerDurationMs.set(key, current);
  }
}

export const serviceMetrics = new ServiceMetrics();
