import { loadEnv } from './env';

const loadedConfig = loadEnv();

// Keep application-local Date operations deterministic outside containers too.
// Bun.SQL separately sets every MySQL session to +00:00.
process.env.TZ = loadedConfig.TZ;

export const config = loadedConfig;
export * from './env';
