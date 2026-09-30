import { Hono } from 'hono';
import { requestIdMiddleware, loggerMiddleware, globalErrorHandler } from '@/shared/middleware';
import { mainRouter } from '@/routes';
import { sendError } from '@/shared/http/response';

export function createApp(): Hono {
  const app = new Hono();

  // Global Middleware
  app.use('*', requestIdMiddleware());
  app.use('*', loggerMiddleware());

  // Mount Routes
  app.route('/', mainRouter);

  // 404 Not Found Handler
  app.notFound((c) => {
    return sendError(c, 'RESOURCE_NOT_FOUND', `Route ${c.req.method} ${c.req.path} not found`, 404);
  });

  // Global Error Handler
  app.onError(globalErrorHandler);

  return app;
}

export const app = createApp();
