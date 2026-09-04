export default () => {
  // Único punto donde vive el dominio público del backend. Los callbacks de OAuth2 (y
  // cualquier otro enlace absoluto que el backend genere) se derivan de aquí en vez de
  // guardar el dominio repetido en un *_CALLBACK_URL por proveedor — cambiar de entorno
  // (localhost → dominio real) solo toca esta variable, sin riesgo de que algún proveedor
  // se quede apuntando al dominio viejo por olvido.
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),

    app: {
      baseUrl: apiBaseUrl,
    },

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
      refreshSecret:
        process.env.JWT_REFRESH_SECRET ?? 'changeme-refresh-secret',
      accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
      refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
    },

    // Storage: driver "local" usa carpeta local; otro valor define proveedor cloud.
    storage: {
      driver: process.env.STORAGE_DRIVER ?? 'local',
      localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
    },

    // Correo saliente — mismo patrón que storage: driver "console" (default) loguea en vez de
    // enviar de verdad. "smtp" (ej. Gmail con una contraseña de aplicación) es el primer driver
    // real, pensado para desarrollo/pruebas — un proveedor transaccional (Resend, SES...) sería
    // otro driver más adelante, sin tocar MailerService.sendMail ni a quien lo consume.
    mailer: {
      driver: process.env.MAILER_DRIVER ?? 'console',
      from: process.env.MAILER_FROM ?? 'no-reply@sublistudio.local',
      smtp: {
        host: process.env.SMTP_HOST ?? '',
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        // STARTTLS (587) es lo normal; secure:true es para el puerto 465 (SSL directo).
        secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
        user: process.env.SMTP_USER ?? '',
        // Para Gmail: NO es la contraseña de la cuenta — es una "contraseña de aplicación"
        // (myaccount.google.com/apppasswords), requiere verificación en dos pasos activada.
        pass: process.env.SMTP_PASS ?? '',
      },
    },

    // OAuth2 — Tener credenciales configuradas NO habilita el proveedor por sí solo: la activación real
    // la decide un admin y se guarda en Variables Globales (OAuthProviderConfigService).
    // callbackUrl se arma solo desde apiBaseUrl + una ruta fija por convención
    // (/auth/<provider>/callback) — un proveedor nuevo no necesita su propia variable de
    // callback, solo su clientId/clientSecret.
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
        callbackUrl: `${apiBaseUrl}/auth/google/callback`,
      },
      facebook: {
        clientId:
          process.env.FACEBOOK_OAUTH_CLIENT_ID ?? 'changeme-facebook-client-id',
        clientSecret:
          process.env.FACEBOOK_OAUTH_CLIENT_SECRET ??
          'changeme-facebook-client-secret',
        callbackUrl: `${apiBaseUrl}/auth/facebook/callback`,
      },
      linkedin: {
        clientId:
          process.env.LINKEDIN_OAUTH_CLIENT_ID ?? 'changeme-linkedin-client-id',
        clientSecret:
          process.env.LINKEDIN_OAUTH_CLIENT_SECRET ??
          'changeme-linkedin-client-secret',
        callbackUrl: `${apiBaseUrl}/auth/linkedin/callback`,
      },
    },
  };
};
