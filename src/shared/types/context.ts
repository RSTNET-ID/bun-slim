import type { ExampleListQuery } from '@/modules/example/example.types';

export interface AuthPrincipal {
  sub: string;
  roles?: string[];
}

export interface Variables {
  requestId: string;
  principal?: AuthPrincipal;
  tenantId?: string;
  listQuery: ExampleListQuery;
  body: unknown;
}

export type AppEnv = {
  Variables: Variables;
};
