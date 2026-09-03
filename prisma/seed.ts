// Seed de datos base — hoy solo los 4 roles fijos del negocio (SUPERADMIN, ADMINISTRADOR,
// CLIENTE, USUARIO). Sin esto, cualquier registro de usuario falla porque User.roleId es
// obligatorio y no hay filas en `roles` todavía. Correr con `npm run db:seed`.
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const isTursoSqlite = (process.env.DB_PROVIDER ?? 'turso-sqlite') === 'turso-sqlite';

const prisma = new PrismaClient(
  isTursoSqlite
    ? {
        adapter: new PrismaLibSQL({
          url: process.env.TURSO_DATABASE_URL!,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }),
      }
    : undefined,
);

const ROLES: Array<{ name: string; slug: string }> = [
  { name: 'Superadmin', slug: 'SUPERADMIN' },
  { name: 'Administrador', slug: 'ADMINISTRADOR' },
  { name: 'Cliente', slug: 'CLIENTE' },
  { name: 'Usuario', slug: 'USUARIO' },
];

async function main(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name },
      create: role,
    });
    // eslint-disable-next-line no-console
    console.log(`Rol listo: ${role.slug}`);
  }
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Error corriendo el seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
