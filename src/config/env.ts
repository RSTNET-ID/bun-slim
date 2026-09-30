import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return value;
}, z.boolean());

export const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    SERVICE_NAME: z.string().min(1).default('example-service'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DB_DRIVER: z.enum(['postgres', 'mysql', 'mariadb']).default('postgres'),

    /**
     * DATABASE_URL wajib di-set. Tidak boleh ada default karena koneksi yang
     * salah di production jauh lebih berbahaya daripada service yang gagal start.
     */
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

    // Bun.SQL pool/lifecycle defaults. Override per service workload.
    DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
    DB_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(30),
    DB_CONNECTION_TIMEOUT_SECONDS: z.coerce.number().int().min(1).default(10),
    DB_MAX_LIFETIME_SECONDS: z.coerce.number().int().min(0).default(0),

    /**
     * Disable named prepared statements when using PgBouncer transaction pooling
     * unless the deployed PgBouncer version/config explicitly supports them.
     */
    DB_PREPARE: booleanFromEnv.default(true),
  })
  .superRefine((env, ctx) => {
    let protocol: string;
    try {
      protocol = new URL(env.DATABASE_URL).protocol.replace(':', '');
    } catch {
      return;
    }

    const acceptedProtocols: Record<typeof env.DB_DRIVER, string[]> = {
      postgres: ['postgres', 'postgresql'],
      mysql: ['mysql', 'mysql2'],
      mariadb: ['mariadb', 'mysql'],
    };

    if (!acceptedProtocols[env.DB_DRIVER].includes(protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: `DATABASE_URL protocol "${protocol}" does not match DB_DRIVER="${env.DB_DRIVER}"`,
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    process.stderr.write(
      `Invalid environment variables:\n${JSON.stringify(result.error.format(), null, 2)}\n`
    );
    throw new Error('Invalid environment variables. Check stderr for details.');
  }

  return result.data;
}
