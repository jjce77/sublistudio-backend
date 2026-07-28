// Sincroniza `provider` del bloque `datasource db` en schema.prisma con DB_PROVIDER (.env).
// Prisma exige que ese campo sea un literal, no puede venir de env().
require('dotenv/config');
const fs = require('fs');
const path = require('path');

// DB_PROVIDER (nuestra variable) -> literal válido de datasource.provider en Prisma.
const PROVIDER_MAP = {
  'turso-sqlite': 'sqlite',
  postgresql: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
};

const dbProvider = process.env.DB_PROVIDER ?? 'turso-sqlite';
const prismaProvider = PROVIDER_MAP[dbProvider];

if (!prismaProvider) {
  console.error(
    `DB_PROVIDER inválido: "${dbProvider}". Usa uno de: ${Object.keys(PROVIDER_MAP).join(', ')}`,
  );
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

const datasourceProviderPattern = /(datasource\s+db\s*{[^}]*?provider\s*=\s*")[a-z]+(")/s;

if (!datasourceProviderPattern.test(schema)) {
  console.error(
    'No se encontró `provider = "..."` dentro del bloque `datasource db { ... }` en prisma/schema.prisma.',
  );
  process.exit(1);
}

const updatedSchema = schema.replace(datasourceProviderPattern, `$1${prismaProvider}$2`);
fs.writeFileSync(schemaPath, updatedSchema);

console.log(
  `DB_PROVIDER="${dbProvider}" -> prisma/schema.prisma: datasource provider = "${prismaProvider}"`,
);
