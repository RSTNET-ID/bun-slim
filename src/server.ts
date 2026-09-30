import { app } from '@/app';
import { config } from '@/config';
import { logger } from '@/shared/logger';
import { closeDbClient } from '@/database/client';

const server = Bun.serve({
  hostname: config.SERVER_HOST,
  port: config.PORT,
  idleTimeout: config.SERVER_IDLE_TIMEOUT_SECONDS,
  maxRequestBodySize: config.MAX_REQUEST_BODY_BYTES,
  development: config.APP_ENV === 'development',
  fetch: app.fetch,
});

logger.info(`Server running at ${server.url}`, {
  environment: config.APP_ENV,
  service: config.SERVICE_NAME,
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  const forceStopTimer = setTimeout(() => {
    logger.error('Graceful shutdown deadline exceeded; forcing active connections closed', {
      shutdown_timeout_ms: config.SHUTDOWN_TIMEOUT_MS,
      pending_requests: server.pendingRequests,
      pending_websockets: server.pendingWebSockets,
    });
    void server.stop(true);
  }, config.SHUTDOWN_TIMEOUT_MS);

  try {
    await server.stop();
    clearTimeout(forceStopTimer);
    logger.info('HTTP server stopped.', {
      pending_requests: server.pendingRequests,
      pending_websockets: server.pendingWebSockets,
    });

    await closeDbClient();

    logger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (error: unknown) {
    clearTimeout(forceStopTimer);
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error during graceful shutdown:', { error: message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
