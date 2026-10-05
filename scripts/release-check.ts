#!/usr/bin/env bun
import { existsSync } from 'node:fs';

const REQUIRED_FILES = [
  'AGENTS.md',
  'README.md',
  'SECURITY.md',
  'CHANGELOG.md',
  '.env.example',
  '.gitignore',
  'Dockerfile',
  'docker-compose.yml',
  'package.json',
  'docs/00-PROJECT.md',
  'docs/01-ARCHITECTURE.md',
  'docs/02-DESIGN.md',
  'docs/03-API-STANDARD.md',
  'docs/05-SECURITY.md',
  'docs/06-OBSERVABILITY.md',
  'docs/07-TESTING.md',
  'docs/08-DEPLOYMENT.md',
  'docs/10-AGENT-STANDARD.md',
  'docs/12-WORKER-REDIS-STANDARD.md',
  'docs/13-CODING-RULES.md',
  'docs/14-OUTBOUND-HTTP-STANDARD.md',
  'docs/15-METRICS-STANDARD.md',
  'docs/16-PRODUCTION-HARDENING.md',
  'docs/17-IDENTITY-TENANT-BOUNDARY.md',
  'docs/18-DRAIN-READINESS-STANDARD.md',
  'docs/19-CONTAINER-RUNTIME-HARDENING.md',
  'docs/20-SERVICE-BOOTSTRAP.md',
  'docs/21-CORE-FREEZE.md',
  'docs/22-RELEASE-READINESS.md',
  'docs/23-SECRET-LOGGING-STANDARD.md',
  'docs/24-PRODUCTION-SECURITY-REVIEW.md',
  'docs/adr/001-mysql-v8-database-variant.md',
  'src/modules/example/example.constants.ts',
  'docs/25-SCHEDULER-STANDARD.md',
  'docs/26-OUTBOX-IDEMPOTENCY-STANDARD.md',
  'src/scheduler.ts',
  'src/scheduler/runner.ts',
  'src/shared/observability/metrics-server.ts',
  'src/scheduler/registry.ts',
  'docker-compose.scheduler.yml',
  'database/seed.ts',
  'database/seeders/20240101000000_example_categories.seeder.ts',
  'scripts/job-dead.ts',
  'src/worker/dead-letter.ts',
] as const;

const REQUIRED_SCRIPTS = [
  'build',
  'typecheck',
  'lint',
  'format:check',
  'test',
  'test:integration',
  'seed',
  'seed:create',
  'build:scheduler',
  'build:job-dead',
  'scheduler:dev',
  'audit:prod',
  'job:dead:list',
  'job:dead:show',
  'job:dead:replay',
  'job:dead:purge',
  'release:check',
] as const;

const failures: string[] = [];

for (const path of REQUIRED_FILES) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
  }
}

const packageJson = (await Bun.file('package.json').json()) as {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
};

if (!packageJson.name || !/^[a-z0-9][a-z0-9._-]*$/.test(packageJson.name)) {
  failures.push('package.json name must be a valid lowercase package/service identifier');
}

if (!packageJson.version || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  failures.push('package.json version must use stable semver X.Y.Z');
}

for (const script of REQUIRED_SCRIPTS) {
  if (!packageJson.scripts?.[script]) {
    failures.push(`Missing package script: ${script}`);
  }
}

const gitignore = await Bun.file('.gitignore').text();
for (const pattern of ['.env', 'dist/', 'node_modules/']) {
  if (!gitignore.includes(pattern)) {
    failures.push(`.gitignore must include: ${pattern}`);
  }
}

const envExample = await Bun.file('.env.example').text();
for (const key of [
  'APP_ENV=',
  'TZ=',
  'SERVICE_NAME=',
  'DATABASE_URL=',
  'DB_DRIVER=',
  'EXAMPLE_ROUTES_ENABLED=',
  'METRICS_ENABLED=',
  'DB_TLS_MODE=',
  'SCHEDULER_ENABLED=',
  'SCHEDULER_TIMEZONE=',
]) {
  if (!envExample.includes(key)) {
    failures.push(`.env.example must define: ${key}`);
  }
}

if (!envExample.includes('TZ=UTC')) {
  failures.push('mysql-v8 .env.example must force TZ=UTC');
}

if (!envExample.includes('DB_DRIVER=mysql')) {
  failures.push('mysql-v8 .env.example must set DB_DRIVER=mysql');
}

const mysqlRuntimeFiles = [
  'src/config/env.ts',
  'src/database/client.ts',
  'database/migrate.ts',
  'database/seed.ts',
  'database/seeders/20240101000000_example_categories.seeder.ts',
  'database/migrations/20240101000000_create_categories_and_examples.ts',
  'database/migrations/20260930161000_add_examples_status_id_index.ts',
  'src/modules/example/example.repository.ts',
  'docker-compose.yml',
] as const;

const forbiddenPostgresPatterns = [
  /postgres(?:ql)?:\/\//i,
  /\bTIMESTAMPTZ\b/i,
  /::(?:uuid|text)\b/i,
  /\bRETURNING\b/i,
  /\bON\s+CONFLICT\b/i,
  /\bpg_advisory_/i,
  /\bCREATE\s+EXTENSION\b/i,
];

for (const path of mysqlRuntimeFiles) {
  const content = await Bun.file(path).text();
  for (const pattern of forbiddenPostgresPatterns) {
    if (pattern.test(content)) {
      failures.push(`MySQL runtime file ${path} contains PostgreSQL-specific syntax: ${pattern}`);
    }
  }
}

const schedulerRunner = await Bun.file('src/scheduler/runner.ts').text();
if (!schedulerRunner.includes('Bun.cron(') || !schedulerRunner.includes('config.SCHEDULER_TIMEZONE') || !schedulerRunner.includes('tz: timezone')) {
  failures.push('scheduler runner must use Bun.cron with configurable explicit timezone');
}
if (!schedulerRunner.includes('serviceMetrics.schedulerTaskStarted()') || !schedulerRunner.includes('serviceMetrics.schedulerTaskFinished(')) {
  failures.push('scheduler runner must publish scheduler execution metrics');
}

const workerEntrypoint = await Bun.file('src/worker.ts').text();
if (!workerEntrypoint.includes("startProcessMetricsServer('worker')") || !workerEntrypoint.includes('stopProcessMetricsServer(metricsServer)')) {
  failures.push('worker entrypoint must start and stop the standalone metrics server');
}

const schedulerEntrypoint = await Bun.file('src/scheduler.ts').text();
if (!schedulerEntrypoint.includes("startProcessMetricsServer('scheduler')") || !schedulerEntrypoint.includes('stopProcessMetricsServer(metricsServer)')) {
  failures.push('scheduler entrypoint must start and stop the standalone metrics server');
}

const forbiddenEnvFragments = [
  /Bearer\s+[A-Za-z0-9._~-]{16,}/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

for (const pattern of forbiddenEnvFragments) {
  if (pattern.test(envExample)) {
    failures.push(`.env.example contains a value matching forbidden secret pattern: ${pattern}`);
  }
}

const dockerfile = await Bun.file('Dockerfile').text();
if (!dockerfile.includes('/app/dist/job-dead ./job-dead')) {
  failures.push('runtime image must include compiled DLQ operations binary');
}

const deadLetterCli = await Bun.file('scripts/job-dead.ts').text();
if (!deadLetterCli.includes('always requires --force')) {
  failures.push('DLQ CLI must keep purge destructive guard');
}
if (!deadLetterCli.includes('Production DLQ replay requires --force')) {
  failures.push('DLQ CLI must keep production replay guard');
}

const agents = await Bun.file('AGENTS.md').text();
for (const doc of ['docs/00-PROJECT.md', 'docs/01-ARCHITECTURE.md', 'docs/13-CODING-RULES.md']) {
  if (!agents.includes(doc)) {
    failures.push(`AGENTS.md must reference: ${doc}`);
  }
}

if (failures.length > 0) {
  console.error('Release readiness check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Release readiness OK: ${packageJson.name}@${packageJson.version} with ${REQUIRED_FILES.length} required files verified.`
);
