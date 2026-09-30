import { Hono } from 'hono';
import { config } from '@/config';
import { healthRoute } from './health.route';
import { metricsRoute } from './metrics.route';
import { exampleRoute } from '@/modules/example/example.route';
import { sendSuccess } from '@/shared/http/response';

export const mainRouter = new Hono();

// Root route (service status / discovery)
mainRouter.get('/', (c) => {
  return sendSuccess(c, {
    service: config.SERVICE_NAME,
    status: 'running',
    version: '1.0.0',
    documentation: '/api/v1',
  });
});

// Health routes (unversioned per 03-API-STANDARD.md)
mainRouter.route('/health', healthRoute);
mainRouter.route('/metrics', metricsRoute);

// API v1 routes
const apiV1 = new Hono();
apiV1.get('/', (c) => {
  return sendSuccess(c, {
    version: 'v1',
    status: 'active',
    endpoints: config.EXAMPLE_ROUTES_ENABLED ? ['/api/v1/examples'] : [],
  });
});

if (config.EXAMPLE_ROUTES_ENABLED) {
  apiV1.route('/examples', exampleRoute);
}

mainRouter.route('/api/v1', apiV1);
