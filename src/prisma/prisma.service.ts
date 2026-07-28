import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

// Motor elegido vía DB_PROVIDER (.env). "turso-sqlite" usa el adapter PrismaLibSQL (Turso no
// soporta `libsql://` nativo); el resto usa el motor nativo de Prisma con DATABASE_URL.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const isTursoSqlite =
      configService.get<string>('database.provider') === 'turso-sqlite';

    super(
      isTursoSqlite
        ? {
            adapter: new PrismaLibSQL({
              url: configService.get<string>('turso.databaseUrl')!,
              authToken: configService.get<string>('turso.authToken'),
            }),
          }
        : {},
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
