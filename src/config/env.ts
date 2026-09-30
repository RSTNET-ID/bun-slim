import { z } from 'zod';

export const envSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  SERVICE_NAME: z.string().min(1).default('example-service'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DB_DRIVER: z.enum(['postgres', 'mysql']).default('postgres'),

  /**
   * DATABASE_URL wajib di-set. Tidak boleh ada default karena koneksi yang
   * salah di production jauh lebih berbahaya daripada service yang gagal start.
   */
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Tulis ke stderr sebelum logger tersedia
    process.stderr.write(
      `❌ Invalid environment variables:\n${JSON.stringify(result.error.format(), null, 2)}\n`
    );
    throw new Error('Invalid environment variables. Check stderr for details.');
  }
  return result.data;
}
