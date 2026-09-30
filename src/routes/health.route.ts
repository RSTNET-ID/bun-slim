import { Hono } from 'hono';
import { checkDatabaseHealth } from '@/database/health';
import { sendSuccess, sendError } from '@/shared/http/response';
import { isAcceptingTraffic } from '@/shared/lifecycle/state';

export const healthRoute = new Hono();

// GET /health
healthRoute.get('/', (c) => {
  return sendSuccess(c, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// GET /health/live
healthRoute.get('/live', (c) => {
  return sendSuccess(c, {
    status: 'up',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// GET /health/ready
healthRoute.get('/ready', async (c) => {
  if (!isAcceptingTraffic()) {
    return sendError(
      c,
      'SERVICE_DRAINING',
      'Service is draining and not accepting new traffic',
      503
    );
  }

  const dbHealth = await checkDatabaseHealth();

  if (!dbHealth.isHealthy) {
    // Detail error sudah dicatat server-side oleh checkDatabaseHealth().
    // Jangan expose hostname, credential hint, atau driver detail ke client.
    return sendError(c, 'SERVICE_UNAVAILABLE', 'Database dependency is unavailable', 503, {
      database: { status: 'down' },
    });
  }

  return sendSuccess(c, {
    status: 'ready',
    database: {
      status: 'up',
      latency_ms: dbHealth.latencyMs,
    },
  });
});
