import { beforeEach, describe, expect, it } from 'bun:test';
import { ServiceMetrics } from '@/shared/observability/metrics';

describe('ServiceMetrics', () => {
  let metrics: ServiceMetrics;

  beforeEach(() => {
    metrics = new ServiceMetrics();
  });

  it('renders low-cardinality HTTP request metrics', () => {
    metrics.httpRequestStarted();
    metrics.recordHttpRequest('get', 201, 250);

    const output = metrics.renderPrometheus();

    expect(output).toContain('service_http_requests_in_flight 0');
    expect(output).toContain('service_http_requests_total{method="GET",status="2xx"} 1');
    expect(output).toContain(
      'service_http_request_duration_seconds_count{method="GET",status="2xx"} 1'
    );
    expect(output).toContain(
      'service_http_request_duration_seconds_sum{method="GET",status="2xx"} 0.25'
    );
    expect(output).not.toContain('/api/');
  });

  it('renders outbound metrics using dependency labels', () => {
    metrics.recordOutboundRequest('bank-provider', 'post', 503, 100);
    metrics.recordOutboundRequest('bank-provider', 'post', 'network_error', 50);

    const output = metrics.renderPrometheus();

    expect(output).toContain(
      'service_outbound_http_requests_total{dependency="bank-provider",method="POST",status="5xx"} 1'
    );
    expect(output).toContain(
      'service_outbound_http_requests_total{dependency="bank-provider",method="POST",status="network_error"} 1'
    );
  });

  it('renders worker and scheduler metrics with bounded labels', () => {
    metrics.workerJobStarted();
    metrics.recordWorkerOutcome('email.send', 'retry', 250);
    metrics.workerJobSettled();
    metrics.recordWorkerReclaimed(2);
    metrics.schedulerTaskStarted();
    metrics.schedulerTaskFinished('daily-sync', 'success', 500);

    const output = metrics.renderPrometheus('worker');

    expect(output).toContain('service_process_info{component="worker"} 1');
    expect(output).toContain('service_worker_jobs_in_flight 0');
    expect(output).toContain(
      'service_worker_jobs_total{job_type="email.send",result="retry"} 1'
    );
    expect(output).toContain('service_worker_reclaimed_total 2');
    expect(output).toContain('service_scheduler_tasks_in_flight 0');
    expect(output).toContain(
      'service_scheduler_runs_total{task="daily-sync",result="success"} 1'
    );
  });

  it('escapes label values safely', () => {
    metrics.recordOutboundRequest('provider"one', 'get', 200, 1);

    const output = metrics.renderPrometheus();

    expect(output).toContain('dependency="provider\\\"one"');
  });
});
