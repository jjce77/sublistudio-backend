// Motor elegido vía DB_PROVIDER (.env). "turso-sqlite" usa el adapter PrismaLibSQL (Turso no
// soporta `libsql://` nativo); el resto usa el motor nativo de Prisma con DATABASE_URL.
// El literal `provider` de schema.prisma se sincroniza con `npm run db:prepare`.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const isTursoSqlite = (process.env.DB_PROVIDER ?? 'turso-sqlite') === 'turso-sqlite';

// Dos ramas completas: PrismaConfig discrimina por `engine`, un spread condicional no tipa bien.
export default isTursoSqlite
  ? defineConfig({
      schema: 'prisma/schema.prisma',
      migrations: {
        path: 'prisma/migrations',
      },
      experimental: { adapter: true },
      engine: 'js',
      async adapter() {
        return new PrismaLibSQL({
          url: process.env.TURSO_DATABASE_URL!,
          authToken: process.env.TURSO_AUTH_TOKEN,
        });
      },
    })
  : defineConfig({
      schema: 'prisma/schema.prisma',
      migrations: {
        path: 'prisma/migrations',
      },
    });
