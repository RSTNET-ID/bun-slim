import { getDbClient } from './client';
import { logger } from '@/shared/logger';

export async function checkDatabaseHealth(): Promise<{ isHealthy: boolean; latencyMs?: number; error?: string }> {
  const start = performance.now();
  try {
    const sql = getDbClient();
    await sql`SELECT 1`;
    const latencyMs = Math.round(performance.now() - start);
    return { isHealthy: true, latencyMs };
  } catch (err: any) {
    logger.error('Database health check failed', { error: err.message });
    return { isHealthy: false, error: err.message || 'Database connection error' };
  }
}
