import { inspectRoutes } from 'hono/dev';
import { app } from '../src/app';

console.log('\n📌 Registered Application Routes:\n');
console.log(`${'METHOD'.padEnd(8)} ${'PATH'.padEnd(35)} ${'HANDLER / TYPE'}`);
console.log('─'.repeat(70));

const routes = inspectRoutes(app);
const displayed = new Set<string>();

for (const r of routes) {
  // Filter out global wildcard middlewares for a cleaner route list output
  if (r.isMiddleware && (r.path === '/*' || r.path === '*')) {
    continue;
  }

  const key = `${r.method}:${r.path}:${r.name}`;
  if (displayed.has(key)) continue;
  displayed.add(key);

  const handlerInfo = r.isMiddleware
    ? `[middleware: ${r.name}]`
    : r.name !== '[handler]'
      ? `handler.${r.name}`
      : '[handler]';
  console.log(`${r.method.padEnd(8)} ${r.path.padEnd(35)} ${handlerInfo}`);
}

console.log('─'.repeat(70));
console.log(`Total Endpoints/Middlewares: ${displayed.size}\n`);
