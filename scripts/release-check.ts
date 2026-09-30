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
] as const;

const REQUIRED_SCRIPTS = [
  'build',
  'typecheck',
  'lint',
  'format:check',
  'test',
  'test:integration',
  'audit:prod',
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
for (const key of ['APP_ENV=', 'SERVICE_NAME=', 'DATABASE_URL=', 'DB_DRIVER=']) {
  if (!envExample.includes(key)) {
    failures.push(`.env.example must define: ${key}`);
  }
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
