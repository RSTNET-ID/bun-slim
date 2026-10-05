import { config } from '@/config';
import { logger } from '@/shared/logger';

export type BackgroundComponent = 'worker' | 'scheduler';

export class ProcessHealthState {
  private ready = false;
  private draining = false;

  markReady(): void {
    if (!this.draining) {
      this.ready = true;
    }
  }

  markDraining(): void {
    this.draining = true;
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready && !this.draining;
  }

  isDraining(): boolean {
    return this.draining;
  }
}

export function startProcessHealthServer(
  component: BackgroundComponent,
  state: ProcessHealthState,
  dependencyReady: () => boolean = () => true
): Bun.Server<undefined> {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: config.PROCESS_HEALTH_PORT,
    development: false,
    fetch(request) {
      const url = new URL(request.url);

      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
        });
      }

      if (url.pathname === '/health/live') {
        return Response.json(
          { status: 'up', component },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      if (url.pathname === '/health/ready') {
        const ready = state.isReady() && dependencyReady();

        return Response.json(
          {
            status: ready ? 'ready' : 'not_ready',
            component,
            draining: state.isDraining(),
          },
          {
            status: ready ? 200 : 503,
            headers: { 'Cache-Control': 'no-store' },
          }
        );
      }

      return new Response('Not Found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    },
  });

  logger.info('Process health server started', {
    component,
    host: '127.0.0.1',
    port: server.port,
  });

  return server;
}

export async function stopProcessHealthServer(server: Bun.Server<undefined>): Promise<void> {
  await server.stop();
}
