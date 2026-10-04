import { loadEnv } from './env';

const loadedConfig = loadEnv();
process.env.TZ = loadedConfig.TZ;

export const config = loadedConfig;
export * from './env';
