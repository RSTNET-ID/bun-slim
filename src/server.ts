import { app } from '@/app';
import { config } from '@/config';
import { logger } from '@/shared/logger';
import { closeDbClient } from '@/database/client';

const server = Bun.serve({
  port: config.PORT,
  fetch: app.fetch,
});

logger.info(`🚀 Server running at http://localhost:${server.port}`, {
  environment: config.APP_ENV,
  service: config.SERVICE_NAME,
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // 1. Stop accepting new requests & stop HTTP server
    await server.stop();
    logger.info('HTTP server stopped.');

    // 2. Close Database Pool
    await closeDbClient();

    logger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (error: unknown) {
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
