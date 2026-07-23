// Config de la Prisma CLI (validate, migrate, studio) para hablar con Turso vía el mismo
// adapter PrismaLibSQL que usa src/prisma/prisma.service.ts en runtime (ver adr-sublistudio.md
// DEC-02). Sin este archivo, la CLI usa el "classic engine", que exige una URL nativa `file:`
// y rechaza `libsql://...` — ver TASKS.md Fase 0.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

export default defineConfig({
  experimental: { adapter: true },
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  engine: 'js',
  async adapter() {
    return new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  },
});
