import { SQL } from 'bun';
import { config } from '@/config';
import { logger } from '@/shared/logger';

let sqlClient: SQL | null = null;

export function createDbClient(url: string = config.DATABASE_URL): SQL {
  return new SQL({
    adapter: config.DB_DRIVER,
    url,
    max: config.DB_POOL_MAX,
    idleTimeout: config.DB_IDLE_TIMEOUT_SECONDS,
    connectionTimeout: config.DB_CONNECTION_TIMEOUT_SECONDS,
    maxLifetime: config.DB_MAX_LIFETIME_SECONDS,
    prepare: config.DB_PREPARE,
    tls: config.DB_TLS_CA_FILE
      ? { ca: Bun.file(config.DB_TLS_CA_FILE), rejectUnauthorized: true }
      : config.DB_TLS_MODE,
    allowPublicKeyRetrieval: config.DB_ALLOW_PUBLIC_KEY_RETRIEVAL,
  });
}

export function getDbClient(): SQL {
  if (!sqlClient) {
    sqlClient = createDbClient();
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
