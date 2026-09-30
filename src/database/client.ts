import { SQL } from 'bun';
import { config } from '@/config';
import { logger } from '@/shared/logger';

let sqlClient: SQL | null = null;

export function getDbClient(): SQL {
  if (!sqlClient) {
    sqlClient = new SQL({
      adapter: config.DB_DRIVER,
      url: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      idleTimeout: config.DB_IDLE_TIMEOUT_SECONDS,
      connectionTimeout: config.DB_CONNECTION_TIMEOUT_SECONDS,
      maxLifetime: config.DB_MAX_LIFETIME_SECONDS,
      prepare: config.DB_PREPARE,
    });
  }

  return sqlClient;
}

export async function closeDbClient(): Promise<void> {
  if (!sqlClient) return;

  logger.info('Closing Bun native SQL connection pool...');
  await sqlClient.close({ timeout: 5 });
  sqlClient = null;
  logger.info('Bun native SQL connection pool closed.');
}
