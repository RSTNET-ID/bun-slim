import { Hono } from 'hono';
import { healthRoute } from './health.route';
import { exampleRoute } from '@/modules/example/example.route';

export const mainRouter = new Hono();

// Health routes (unversioned per 03-API-STANDARD.md)
mainRouter.route('/health', healthRoute);

// API v1 routes
const apiV1 = new Hono();
apiV1.route('/examples', exampleRoute);

mainRouter.route('/api/v1', apiV1);
