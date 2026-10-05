import { config } from '@/config';
import { logger } from '@/shared/logger';
import { isMetricsAuthorized } from './metrics-auth';
import { serviceMetrics } from './metrics';

export type MetricsComponent = 'worker' | 'scheduler';

export function startProcessMetricsServer(component: MetricsComponent): Bun.Server<undefined> | null {
  if (!config.METRICS_ENABLED) return null;

  const server = Bun.serve({
    hostname: config.METRICS_HOST,
    port: config.METRICS_PORT,
    development: false,
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname !== '/metrics') {
        return new Response('Not Found', { status: 404 });
      }

      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET' },
        });
      }

      if (!isMetricsAuthorized(request.headers.get('Authorization'), config.METRICS_TOKEN)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer realm="metrics"',
            'Cache-Control': 'no-store',
          },
        });
      }

      return new Response(serviceMetrics.renderPrometheus(component), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    },
  });

  logger.info('Process metrics server started', {
    component,
    host: config.METRICS_HOST,
    port: server.port,
  });

  return server;
}

export async function stopProcessMetricsServer(
  server: Bun.Server<undefined> | null
): Promise<void> {
  if (!server) return;
  await server.stop();
}
