import { readFileSync } from 'node:fs';
import { z } from 'zod';

type RawEnv = Record<string, string | undefined>;

const FILE_BACKED_SECRETS = [
  ['DATABASE_URL', 'DATABASE_URL_FILE'],
  ['MIGRATION_DATABASE_URL', 'MIGRATION_DATABASE_URL_FILE'],
  ['REDIS_URL', 'REDIS_URL_FILE'],
  ['METRICS_TOKEN', 'METRICS_TOKEN_FILE'],
] as const;

export function resolveFileBackedSecrets(env: RawEnv): RawEnv {
  const resolved = { ...env };

  for (const [valueKey, fileKey] of FILE_BACKED_SECRETS) {
    const directValue = resolved[valueKey];
    const filePath = resolved[fileKey];

    if (directValue && filePath) {
      throw new Error(`${valueKey} and ${fileKey} cannot both be set`);
    }

    if (directValue || !filePath) continue;

    let value: string;
    try {
      value = readFileSync(filePath, 'utf8').trim();
    } catch (error: unknown) {
      throw new Error(`Failed to read secret file for ${valueKey}`, { cause: error });
    }

    if (!value) {
      throw new Error(`${fileKey} points to an empty secret file`);
    }

    resolved[valueKey] = value;
  }

  return resolved;
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

const timezoneSchema = z.string().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  },
  { message: 'SCHEDULER_TIMEZONE must be a valid IANA timezone' }
);

export const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    TZ: z.literal('UTC').default('UTC'),
    SERVICE_NAME: z.string().min(1).default('example-service'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    SERVER_HOST: z.string().min(1).default('0.0.0.0'),
    SERVER_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(255).default(15),
    MAX_REQUEST_BODY_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
    SHUTDOWN_DRAIN_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(1000),
    SECURITY_HEADERS_ENABLED: booleanFromEnv.default(true),

    METRICS_ENABLED: booleanFromEnv.default(false),
    METRICS_TOKEN: z.string().min(24).optional(),
    METRICS_HOST: z.string().min(1).default('0.0.0.0'),
    METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
    PROCESS_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(9465),
    EXAMPLE_ROUTES_ENABLED: booleanFromEnv.default(false),

    OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    OUTBOUND_HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    OUTBOUND_HTTP_RETRY_BASE_MS: z.coerce.number().int().min(0).max(10_000).default(100),

    DB_DRIVER: z.literal('mysql').default('mysql'),
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
    MIGRATION_DATABASE_URL: z
      .string()
      .url('MIGRATION_DATABASE_URL must be a valid connection URL')
      .optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
    DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(30),
    DB_CONNECTION_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(10),
    DB_MAX_LIFETIME_SECONDS: z.coerce.number().int().min(0).default(0),
    DB_PREPARE: booleanFromEnv.default(true),
    DB_TLS_MODE: z
      .enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])
      .default('disable'),
    DB_TLS_CA_FILE: z.string().min(1).optional(),
    DB_ALLOW_PUBLIC_KEY_RETRIEVAL: booleanFromEnv.default(false),

    WORKER_ENABLED: booleanFromEnv.default(false),
    SCHEDULER_ENABLED: booleanFromEnv.default(false),
    SCHEDULER_TIMEZONE: timezoneSchema.default('UTC'),
    REDIS_URL: z.string().url('REDIS_URL must be a valid Redis URL').optional(),
    REDIS_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    REDIS_MAX_RETRIES: z.coerce.number().int().min(0).max(100).default(20),
    WORKER_QUEUE_NAME: z.string().min(1).default('default'),
    WORKER_QUEUE_PREFIX: z.string().min(1).default('queue'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(1),
    WORKER_BLOCK_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
    WORKER_JOB_TIMEOUT_MS: z.coerce.number().int().min(100).default(30_000),
    WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(3),
    WORKER_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(1000),
    WORKER_STALE_AFTER_MS: z.coerce.number().int().min(1000).default(60_000),
    WORKER_RECLAIM_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  })
  .superRefine((env, ctx) => {
    let protocol: string;
    try {
      protocol = new URL(env.DATABASE_URL).protocol.replace(':', '');
    } catch {
      return;
    }

    if (env.METRICS_ENABLED && env.METRICS_PORT === env.PROCESS_HEALTH_PORT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PROCESS_HEALTH_PORT'],
        message: 'PROCESS_HEALTH_PORT must differ from METRICS_PORT when metrics are enabled',
      });
    }

    if (env.METRICS_ENABLED && !env.METRICS_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required when metrics are enabled',
      });
    }

    if (env.APP_ENV === 'staging' || env.APP_ENV === 'production') {
      if (env.EXAMPLE_ROUTES_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EXAMPLE_ROUTES_ENABLED'],
          message: 'Example routes must be disabled in staging/production',
        });
      }

      const weakUsernames = new Set(['user', 'test', 'example', 'root', 'mysql']);
      const weakPasswords = new Set([
        'password',
        'changeme',
        'secret',
        'test',
        'example',
        'root',
        'mysql',
      ]);

      for (const [field, value] of [
        ['DATABASE_URL', env.DATABASE_URL],
        ['MIGRATION_DATABASE_URL', env.MIGRATION_DATABASE_URL],
      ] as const) {
        if (!value) continue;

        try {
          const databaseUrl = new URL(value);
          if (
            weakUsernames.has(decodeURIComponent(databaseUrl.username).toLowerCase()) &&
            weakPasswords.has(decodeURIComponent(databaseUrl.password).toLowerCase())
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [field],
              message: `${field} uses placeholder/default credentials in staging/production`,
            });
          }
        } catch {
          // URL validation already reports malformed connection URLs.
        }
      }

      if (env.DB_TLS_MODE !== 'verify-full') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_TLS_MODE'],
          message: 'DB_TLS_MODE must be verify-full in staging/production',
        });
      }

      if (env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DB_ALLOW_PUBLIC_KEY_RETRIEVAL'],
          message:
            'DB_ALLOW_PUBLIC_KEY_RETRIEVAL is development-only; use TLS for MySQL in staging/production',
        });
      }
    }

    if (env.WORKER_ENABLED && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when WORKER_ENABLED=true',
      });
    }

    if (!['mysql', 'mysql2'].includes(protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: `DATABASE_URL protocol "${protocol}" does not match DB_DRIVER="mysql"`,
      });
    }

    if (env.MIGRATION_DATABASE_URL) {
      const migrationProtocol = new URL(env.MIGRATION_DATABASE_URL).protocol.replace(':', '');
      if (!['mysql', 'mysql2'].includes(migrationProtocol)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MIGRATION_DATABASE_URL'],
          message: `MIGRATION_DATABASE_URL protocol "${migrationProtocol}" does not match DB_DRIVER="mysql"`,
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(env: RawEnv = process.env): EnvConfig {
  const result = envSchema.safeParse(resolveFileBackedSecrets(env));
  if (!result.success) {
    process.stderr.write(
      `Invalid environment variables:\n${JSON.stringify(result.error.format(), null, 2)}\n`
    );
    throw new Error('Invalid environment variables. Check stderr for details.');
  }

  return result.data;
}
