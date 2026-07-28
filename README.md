
# SubliStudio — Backend
Sublistudio-backend: es backend en nest que soporta una plataforma digital de comercio de imagenes.
API de la plataforma de membresía SubliStudio. NestJS + Prisma + Turso (libSQL).

## Requisitos

- Node.js 20+
- Servicio de base de datos.
- Docker (opcional, para levantar Redis)

## Puesta en marcha

```bash
npm install
cp .env.example .env
# Editar .env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, DATABASE_URL
```

### Base de datos
```bash
# Sincroniza las tablas directamente en la base de datos de Turso
npx prisma db push

# Genera el cliente de Prisma para el autocompletado en el código
npx prisma generate
```
revisar: npx prisma migrate dev --name init

### Levantar servicios (Redis)

```bash
docker compose up -d redis
```

### Arrancar el backend

```bash
npm run start:dev
```

- API: http://localhost:3000
- Health check: http://localhost:3000/health
- Swagger/OpenAPI: http://localhost:3000/api-docs

## Storage de archivos

Fase 0–8: almacenamiento en carpeta local (`./storage`, configurable vía `STORAGE_LOCAL_PATH`).
Fase 9: se decide el proveedor cloud definitivo (ver ADR DEC-04) y se migra detrás de la interfaz de storage.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Arranca en modo watch |
| `npm run build` | Compila a `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Tests unitarios |
| `npm run test:e2e` | Tests end-to-end |

