export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  },

  // Motor de BD: "turso-sqlite" (adapter PrismaLibSQL) | "postgresql" | "mysql" | "sqlite" (nativo).
  // Ver prisma.config.ts y src/prisma/prisma.service.ts.
  database: {
    provider: process.env.DB_PROVIDER ?? 'turso-sqlite',
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

  // OAuth2 (Fase 1) — ver adr-sublistudio.md DEC-05, "Arquitectura de proveedores OAuth2".
  // Tener credenciales configuradas NO habilita el proveedor por sí solo: la activación real
  // la decide un admin y se guarda en Variables Globales (OAuthProviderConfigService).
  // Placeholders "changeme-*" (mismo criterio que jwt.accessSecret/jwt.refreshSecret arriba):
  // passport-oauth2 exige un clientID no vacío en su constructor — sin este placeholder, un
  // ambiente sin credenciales reales de Google no podría ni arrancar la app, aunque el proveedor
  // esté deshabilitado (OAuthProviderEnabledGuard ya impide que se use sin habilitar).
  oauth: {
    google: {
      clientId:
        process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'changeme-google-client-id',
      clientSecret:
        process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
        'changeme-google-client-secret',
      callbackUrl:
        process.env.GOOGLE_OAUTH_CALLBACK_URL ??
        'http://localhost:3000/auth/google/callback',
    },
  },
});
