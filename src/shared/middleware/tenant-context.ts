import type { MiddlewareHandler } from 'hono';
import { ValidationError } from '@/shared/errors';

/**
 * Tenant Context Middleware
 *
 * Mengekstrak tenant_id dari header dan menyimpannya ke Hono context.
 * Berguna untuk multi-tenant service.
 *
 * Contoh penggunaan:
 *   app.use('/api/v1/*', tenantContext({ required: true }))
 *   // Di handler:
 *   const tenantId = c.get('tenantId') as string;
 */
export interface TenantContextOptions {
  /** Header name untuk tenant ID. Default: 'X-Tenant-ID' */
  headerName?: string;
  /** Apakah tenant ID wajib. Default: true */
  required?: boolean;
}

export const tenantContext = (options: TenantContextOptions = {}): MiddlewareHandler => {
  const headerName = (options.headerName ?? 'X-Tenant-ID').toLowerCase();
  const required = options.required ?? true;

  return async (c, next) => {
    const tenantId = c.req.header(headerName);

    if (!tenantId && required) {
      throw new ValidationError(`Missing required header: ${headerName}`);
    }

    if (tenantId) {
      c.set('tenantId', tenantId);
    }

    await next();
  };
};
