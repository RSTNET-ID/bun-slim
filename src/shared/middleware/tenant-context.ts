import type { MiddlewareHandler } from 'hono';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { AuthPrincipal } from '@/shared/types/context';

const TENANT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface TenantContextOptions {
  headerName?: string;
  required?: boolean;
  /**
   * Authorization callback is required before a tenant header is trusted.
   * Return true only if the authenticated principal may act on the tenant.
   */
  authorizeTenant: (
    tenantId: string,
    principal: AuthPrincipal | undefined
  ) => boolean | Promise<boolean>;
}

export const tenantContext = (options: TenantContextOptions): MiddlewareHandler => {
  const headerName = (options.headerName ?? 'X-Tenant-ID').toLowerCase();
  const required = options.required ?? true;

  return async (c, next) => {
    const tenantId = c.req.header(headerName);

    if (!tenantId) {
      if (required) {
        throw new ValidationError(`Missing required header: ${headerName}`);
      }

      await next();
      return;
    }

    if (!TENANT_ID_PATTERN.test(tenantId)) {
      throw new ValidationError(`Invalid tenant identifier in header: ${headerName}`);
    }

    const principal = c.get('principal') as AuthPrincipal | undefined;
    const authorized = await options.authorizeTenant(tenantId, principal);

    if (!authorized) {
      throw new ForbiddenError('Tenant access is not permitted');
    }

    c.set('tenantId', tenantId);
    await next();
  };
};
