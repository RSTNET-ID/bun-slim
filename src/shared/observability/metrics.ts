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

export class ServiceMetrics {
  private httpInFlight = 0;
  private readonly httpRequests = new Map<string, number>();
  private readonly httpDurationMs = new Map<string, { count: number; sum: number }>();
  private readonly outboundRequests = new Map<string, number>();
  private readonly outboundDurationMs = new Map<string, { count: number; sum: number }>();

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

  renderPrometheus(): string {
    const lines: string[] = [
      '# HELP service_http_requests_in_flight Current in-flight HTTP requests.',
      '# TYPE service_http_requests_in_flight gauge',
      `service_http_requests_in_flight ${this.httpInFlight}`,
      '# HELP service_http_requests_total Total HTTP requests grouped by method and status class.',
      '# TYPE service_http_requests_total counter',
    ];

    for (const [key, value] of this.httpRequests) {
      const [method, status] = key.split('|') as [string, string];
      lines.push(
        `service_http_requests_total${labelString({ method, status })} ${value}`
      );
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

    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.httpInFlight = 0;
    this.httpRequests.clear();
    this.httpDurationMs.clear();
    this.outboundRequests.clear();
    this.outboundDurationMs.clear();
  }
}

export const serviceMetrics = new ServiceMetrics();
