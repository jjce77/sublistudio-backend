# Imagen de producción — multi-stage. Distinta de Dockerfile.dev (que monta el código como
# volumen para hot-reload); esta compila una vez y corre el JS ya buildeado, sin devDependencies.

# ---- build ----
FROM node:20-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# DB_PROVIDER/DATABASE_URL acá son solo para que `prisma generate` resuelva el schema — no
# conectan a ninguna base real (eso pasa recién en runtime, con las env vars reales del host).
ENV DB_PROVIDER=turso-sqlite
ENV DATABASE_URL=file:./prisma/dev.db

RUN npm run db:generate
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "dist/main"]
