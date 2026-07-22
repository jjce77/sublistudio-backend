export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  },

  turso: {
    databaseUrl: process.env.TURSO_DATABASE_URL ?? 'http://127.0.0.1:8080',
    authToken: process.env.TURSO_AUTH_TOKEN ?? '',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'changeme-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'changeme-refresh-secret',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
  },

  // Storage: Fase 0 usa driver "local". Fase 9 define proveedor cloud (ver adr-sublistudio.md DEC-04).
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
  },
});
