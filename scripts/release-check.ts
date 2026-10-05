#!/usr/bin/env bun
import { existsSync, readdirSync } from 'node:fs';

const REQUIRED_FILES = [
  'AGENTS.md',
  'README.md',
  'SECURITY.md',
  'CHANGELOG.md',
  '.env.example',
  '.gitignore',
  '.github/workflows/ci.yml',
  'renovate.json',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.worker.yml',
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
  'docs/27-RUNTIME-DOCTOR.md',
  'src/scheduler.ts',
  'src/scheduler/runner.ts',
  'src/shared/observability/metrics-server.ts',
  'src/shared/lifecycle/process-health.ts',
  'tests/unit/shared/lifecycle/process-health.test.ts',
  'src/scheduler/registry.ts',
  'docker-compose.scheduler.yml',
  'database/migrate.ts',
  'database/seed.ts',
  'database/registry-generator.ts',
  'database/migrations/registry.ts',
  'database/seeders/registry.ts',
  'database/seeders/20240101000000_example_categories.seeder.ts',
  'scripts/job-dead.ts',
  'scripts/doctor.ts',
  'tests/unit/scripts/doctor.test.ts',
  'src/worker/dead-letter.ts',
] as const;

const REQUIRED_SCRIPTS = [
  'build',
  'build:server',
  'build:worker',
  'db:registry:generate',
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
  'doctor',
  'doctor:offline',
  'build:doctor',
  'build:migrate',
  'build:seed',
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
  'MIGRATION_DATABASE_URL=',
  'DB_DRIVER=',
  'EXAMPLE_ROUTES_ENABLED=',
  'METRICS_ENABLED=',
  'PROCESS_HEALTH_PORT=',
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
if (!dockerfile.includes('/app/dist/doctor ./doctor')) {
  failures.push('runtime image must include compiled doctor binary');
}
if (!dockerfile.includes('/app/dist/migrate ./migrate')) {
  failures.push('runtime image must include compiled migration binary');
}
if (!dockerfile.includes('/app/dist/seed ./seed')) {
  failures.push('runtime image must include compiled seeder binary');
}
if (dockerfile.includes('/app/database/')) {
  failures.push('runtime image must not copy database TypeScript source');
}
if (
  !packageJson.scripts?.build?.includes('build:migrate') ||
  !packageJson.scripts?.build?.includes('build:seed')
) {
  failures.push('build script must compile migrate and seed binaries');
}
if (/^\s*HEALTHCHECK\b/m.test(dockerfile)) {
  failures.push('shared runtime image must not define a role-specific HEALTHCHECK');
}
if (!dockerfile.includes('ENV TZ=UTC') || dockerfile.includes('ARG TZ')) {
  failures.push('runtime image must force UTC and must not expose TZ as a build argument');
}
if (dockerfile.includes('ARG BUN_VERSION') || !dockerfile.includes('FROM oven/bun:1.4.0-alpine')) {
  failures.push('Bun Docker dependency must use an explicit Renovate-detectable tag');
}

for (const script of [
  'build:server',
  'build:worker',
  'build:scheduler',
  'build:job-dead',
  'build:doctor',
  'build:migrate',
  'build:seed',
]) {
  const command = packageJson.scripts?.[script] ?? '';
  if (
    !command.includes('--no-compile-autoload-dotenv') ||
    !command.includes('--no-compile-autoload-bunfig')
  ) {
    failures.push(`${script} must disable compiled dotenv and bunfig autoload`);
  }
}

const processHealth = await Bun.file('src/shared/lifecycle/process-health.ts').text();
for (const fragment of [
  "hostname: '127.0.0.1'",
  "'/health/live'",
  "'/health/ready'",
]) {
  if (!processHealth.includes(fragment)) {
    failures.push(`process health server missing required behavior: ${fragment}`);
  }
}

const baseCompose = await Bun.file('docker-compose.yml').text();
if (!baseCompose.includes('stop_grace_period: 25s')) {
  failures.push('app compose service must allow bounded graceful shutdown');
}
if (!baseCompose.includes('http://127.0.0.1:3000/health/ready')) {
  failures.push('app compose service must use the HTTP readiness healthcheck');
}
if (
  !baseCompose.includes('database:\n    internal: true') ||
  !baseCompose.includes('queue:\n    internal: true') ||
  !baseCompose.includes('      - runtime\n      - database\n      - queue')
) {
  failures.push('base compose must segment runtime, database, and queue networks');
}
if (!baseCompose.includes('max-size: "10m"') || !baseCompose.includes('mem_limit:')) {
  failures.push('base compose must bound logs and application memory');
}
if (
  !baseCompose.includes('migrate:') ||
  !baseCompose.includes('command: ["./migrate", "up"]') ||
  !baseCompose.includes('condition: service_completed_successfully')
) {
  failures.push('base compose must gate application startup on successful one-shot migrations');
}
if (!baseCompose.includes('profiles: ["seed"]') || !baseCompose.includes('command: ["./seed", "run"]')) {
  failures.push('base compose must expose seeding as an explicit profile, not automatic startup work');
}

const workerCompose = await Bun.file('docker-compose.worker.yml').text();
if (
  !workerCompose.includes('stop_grace_period: 40s') ||
  !workerCompose.includes('http://127.0.0.1:9465/health/ready') ||
  workerCompose.includes('kill -0 1') ||
  !workerCompose.includes('condition: service_completed_successfully') ||
  !workerCompose.includes('      - runtime\n      - database\n      - queue')
) {
  failures.push('worker compose must use process readiness and a sufficient stop grace period');
}

const schedulerCompose = await Bun.file('docker-compose.scheduler.yml').text();
if (
  !schedulerCompose.includes('stop_grace_period: 25s') ||
  !schedulerCompose.includes('http://127.0.0.1:9465/health/ready') ||
  schedulerCompose.includes('kill -0 1') ||
  !schedulerCompose.includes('condition: service_completed_successfully') ||
  !schedulerCompose.includes('      - runtime\n      - database\n      - queue')
) {
  failures.push('scheduler compose must use process readiness and a sufficient stop grace period');
}

const migrationRunner = await Bun.file('database/migrate.ts').text();
if (!migrationRunner.includes("from './migrations/registry'")) {
  failures.push('migration runner must use the static bundled migration registry');
}
if (!migrationRunner.includes('config.MIGRATION_DATABASE_URL ?? config.DATABASE_URL')) {
  failures.push('migration runner must support a dedicated migration database credential');
}
if (
  !migrationRunner.includes('Production migrate down requires --force') ||
  !migrationRunner.includes('migrate create is disabled in staging/production')
) {
  failures.push('production migration CLI must guard destructive/source-generation commands');
}
if (
  !migrationRunner.includes('GET_LOCK') ||
  !migrationRunner.includes('Could not acquire MySQL migration lock within 30s')
) {
  failures.push('MySQL migration lock acquisition must be bounded');
}

const migrationRegistry = await Bun.file('database/migrations/registry.ts').text();
const migrationFiles = readdirSync('database/migrations')
  .filter((file) => file.endsWith('.ts') && file !== 'registry.ts' && !file.startsWith('_'))
  .sort();
const registeredMigrations = [...migrationRegistry.matchAll(/version: '([^']+)'/g)]
  .map((match) => match[1]!)
  .sort();
if (JSON.stringify(migrationFiles) !== JSON.stringify(registeredMigrations)) {
  failures.push('migration registry is out of sync; use migrate create or refresh the registry');
}

const seederRunner = await Bun.file('database/seed.ts').text();
if (!seederRunner.includes("from './seeders/registry'")) {
  failures.push('seeder runner must use the static bundled seeder registry');
}
if (!seederRunner.includes('seed create is disabled in staging/production')) {
  failures.push('seeder CLI must block source generation in deployed environments');
}

const seederRegistry = await Bun.file('database/seeders/registry.ts').text();
const seederFiles = readdirSync('database/seeders')
  .filter((file) => file.endsWith('.seeder.ts') && file !== 'registry.ts' && !file.startsWith('_'))
  .sort();
const registeredSeeders = [...seederRegistry.matchAll(/filename: '([^']+)'/g)]
  .map((match) => match[1]!)
  .sort();
if (JSON.stringify(seederFiles) !== JSON.stringify(registeredSeeders)) {
  failures.push('seeder registry is out of sync; use seed:create or refresh the registry');
}

const doctorCli = await Bun.file('scripts/doctor.ts').text();
for (const fragment of [
  'envSchema.safeParse(process.env)',
  'await sql`SELECT 1`',
  "await redis.send('PING', [])",
  "case '--offline'",
]) {
  if (!doctorCli.includes(fragment)) {
    failures.push(`runtime doctor is missing required behavior: ${fragment}`);
  }
}

const deadLetterCli = await Bun.file('scripts/job-dead.ts').text();
if (!deadLetterCli.includes('always requires --force')) {
  failures.push('DLQ CLI must keep purge destructive guard');
}
if (!deadLetterCli.includes('Production DLQ replay requires --force')) {
  failures.push('DLQ CLI must keep production replay guard');
}

const ciWorkflow = await Bun.file('.github/workflows/ci.yml').text();
for (const requiredAction of [
  'aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25',
  'anchore/sbom-action@66cbf4bc1f1c0d2edc94016e65bc221b6bb0ad6c',
]) {
  if (!ciWorkflow.includes(requiredAction)) {
    failures.push(`CI must include pinned container supply-chain action: ${requiredAction}`);
  }
}

const renovateConfig = await Bun.file('renovate.json').text();
for (const fragment of [
  'docker:pinDigests',
  'helpers:pinGitHubActionDigests',
  '"main"',
  '"mysql-v8"',
]) {
  if (!renovateConfig.includes(fragment)) {
    failures.push(`Renovate config missing required multi-branch supply-chain policy: ${fragment}`);
  }
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
