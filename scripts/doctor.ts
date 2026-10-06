#!/usr/bin/env bun
import { RedisClient } from 'bun';
import { envSchema, resolveFileBackedSecrets } from '@/config/env';

export type DoctorStatus = 'pass' | 'fail' | 'skip';

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

export interface DoctorOptions {
  offline: boolean;
  json: boolean;
  help: boolean;
}

export function parseDoctorArgs(args: string[]): DoctorOptions {
  const options: DoctorOptions = {
    offline: false,
    json: false,
    help: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--offline':
        options.offline = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function isSupportedBunVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;

  const major = Number.parseInt(match[1] ?? '0', 10);
  const minor = Number.parseInt(match[2] ?? '0', 10);
  const patch = Number.parseInt(match[3] ?? '0', 10);

  return major === 1 && minor === 4 && patch >= 2;
}

export function hasDoctorFailures(checks: DoctorCheck[]): boolean {
  return checks.some((check) => check.status === 'fail');
}

function printHelp(): void {
  console.log(`Bun Slim runtime doctor

Usage:
  bun run doctor [--offline] [--json]
  ./doctor [--offline] [--json]

Options:
  --offline  Validate runtime configuration and registries without network checks.
  --json     Emit machine-readable JSON.
  --help     Show this help.
`);
}

function printHuman(checks: DoctorCheck[], offline: boolean): void {
  console.log(`Bun Slim doctor (${offline ? 'offline' : 'runtime'})`);

  for (const check of checks) {
    console.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((check) => check.status === 'fail').length;
  const skipped = checks.filter((check) => check.status === 'skip').length;
  console.log(
    `Doctor result: ${failed === 0 ? 'OK' : 'FAILED'}; failed=${failed}; skipped=${skipped}; total=${checks.length}`
  );
}

function envIssueNames(issues: Array<{ path: PropertyKey[] }>): string[] {
  const names = new Set(
    issues.map((issue) => issue.path.map(String).join('.') || 'environment')
  );
  return [...names].sort();
}

async function runDoctor(options: DoctorOptions): Promise<number> {
  const checks: DoctorCheck[] = [];

  let parsed: ReturnType<typeof envSchema.safeParse>;

  try {
    parsed = envSchema.safeParse(resolveFileBackedSecrets(process.env));
  } catch {
    checks.push({
      name: 'environment',
      status: 'fail',
      detail: 'file-backed secret resolution failed',
    });

    if (options.json) {
      console.log(JSON.stringify({ ok: false, offline: options.offline, checks }, null, 2));
    } else {
      printHuman(checks, options.offline);
    }
    return 1;
  }

  if (!parsed.success) {
    const fields = envIssueNames(parsed.error.issues);
    checks.push({
      name: 'environment',
      status: 'fail',
      detail: `invalid configuration fields: ${fields.join(', ')}`,
    });

    if (options.json) {
      console.log(JSON.stringify({ ok: false, offline: options.offline, checks }, null, 2));
    } else {
      printHuman(checks, options.offline);
    }
    return 1;
  }

  const config = parsed.data;
  process.env.TZ = config.TZ;

  checks.push({
    name: 'environment',
    status: 'pass',
    detail: `APP_ENV=${config.APP_ENV}; DB_DRIVER=${config.DB_DRIVER}; TZ=${config.TZ}; REDIS_NAMESPACE=${config.REDIS_NAMESPACE}`,
  });

  checks.push({
    name: 'bun-runtime',
    status: isSupportedBunVersion(Bun.version) ? 'pass' : 'fail',
    detail: `Bun ${Bun.version}; required 1.4.x with patch >= 1.4.2`,
  });

  if (config.DB_TLS_CA_FILE) {
    const exists = await Bun.file(config.DB_TLS_CA_FILE).exists();
    checks.push({
      name: 'database-ca',
      status: exists ? 'pass' : 'fail',
      detail: exists ? 'configured CA file exists' : 'configured CA file does not exist',
    });
  } else {
    checks.push({
      name: 'database-ca',
      status: 'skip',
      detail: 'DB_TLS_CA_FILE is not configured',
    });
  }

  const { jobHandlers } = await import('@/worker/registry');
  const handlerCount = Object.keys(jobHandlers).length;

  if (config.WORKER_ENABLED && handlerCount === 0) {
    checks.push({
      name: 'worker-registry',
      status: 'fail',
      detail: 'WORKER_ENABLED=true but no job handlers are registered',
    });
  } else if (handlerCount === 0) {
    checks.push({
      name: 'worker-registry',
      status: 'skip',
      detail: 'worker disabled and no job handlers are registered',
    });
  } else {
    checks.push({
      name: 'worker-registry',
      status: 'pass',
      detail: `${handlerCount} job handler(s) registered`,
    });
  }

  const [{ scheduledTasks }, { validateScheduledTasks }] = await Promise.all([
    import('@/scheduler/registry'),
    import('@/scheduler/runner'),
  ]);

  if (config.SCHEDULER_ENABLED && scheduledTasks.length === 0) {
    checks.push({
      name: 'scheduler-registry',
      status: 'fail',
      detail: 'SCHEDULER_ENABLED=true but no scheduled tasks are registered',
    });
  } else if (scheduledTasks.length === 0) {
    checks.push({
      name: 'scheduler-registry',
      status: 'skip',
      detail: 'scheduler disabled and no tasks are registered',
    });
  } else {
    try {
      validateScheduledTasks(scheduledTasks);
      checks.push({
        name: 'scheduler-registry',
        status: 'pass',
        detail: `${scheduledTasks.length} scheduled task(s) validated`,
      });
    } catch {
      checks.push({
        name: 'scheduler-registry',
        status: 'fail',
        detail: 'registered scheduler task configuration is invalid',
      });
    }
  }

  if (options.offline) {
    checks.push({
      name: 'database',
      status: 'skip',
      detail: 'network check disabled by --offline',
    });
    checks.push({
      name: 'redis',
      status: 'skip',
      detail: 'network check disabled by --offline',
    });
  } else {
    const { createDbClient } = await import('@/database/client');
    const sql = createDbClient();

    try {
      const startedAt = performance.now();
      await sql`SELECT 1`;
      checks.push({
        name: 'database',
        status: 'pass',
        detail: `${config.DB_DRIVER} reachable in ${Math.round(performance.now() - startedAt)}ms`,
      });
    } catch {
      checks.push({
        name: 'database',
        status: 'fail',
        detail: `${config.DB_DRIVER} connection check failed`,
      });
    } finally {
      await sql.close({ timeout: 5 });
    }

    if (!config.REDIS_URL) {
      checks.push({
        name: 'redis',
        status: 'skip',
        detail: 'REDIS_URL is not configured',
      });
    } else {
      const redis = new RedisClient(config.REDIS_URL, {
        connectionTimeout: config.REDIS_CONNECTION_TIMEOUT_MS,
        autoReconnect: false,
        maxRetries: 0,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
      });

      try {
        const startedAt = performance.now();
        await redis.connect();
        const pong = await redis.send('PING', []);

        if (String(pong).toUpperCase() !== 'PONG') {
          throw new Error('Unexpected Redis PING response');
        }

        checks.push({
          name: 'redis',
          status: 'pass',
          detail: `reachable in ${Math.round(performance.now() - startedAt)}ms`,
        });
      } catch {
        checks.push({
          name: 'redis',
          status: 'fail',
          detail: 'connection or PING check failed',
        });
      } finally {
        redis.close();
      }
    }
  }

  const failed = hasDoctorFailures(checks);

  if (options.json) {
    console.log(JSON.stringify({ ok: !failed, offline: options.offline, checks }, null, 2));
  } else {
    printHuman(checks, options.offline);
  }

  return failed ? 1 : 0;
}

async function main(): Promise<number> {
  let options: DoctorOptions;

  try {
    options = parseDoctorArgs(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for supported options.');
    return 2;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  return runDoctor(options);
}

if (import.meta.main) {
  process.exitCode = await main();
}
