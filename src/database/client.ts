import { SQL } from 'bun';
import { config } from '@/config';
import { logger } from '@/shared/logger';

let sqlClient: SQL | null = null;

export function getDbClient(): SQL {
  if (!sqlClient) {
    sqlClient = new SQL(config.DATABASE_URL);
  }
  return sqlClient;
}

export async function closeDbClient(): Promise<void> {
  if (sqlClient) {
    logger.info('Closing Bun native SQL connection...');
    await sqlClient.close();
    sqlClient = null;
    logger.info('Bun native SQL connection closed.');
  }
}
