import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

// Driver adapter libSQL (patrón Prisma 6.6+, ver TASKS.md Fase 0 y adr-sublistudio.md DEC-02).
// El authToken se pasa aquí, nunca embebido en una URL tipo `libsql://user:token@host`.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaLibSQL({
      url: configService.get<string>('turso.databaseUrl')!,
      authToken: configService.get<string>('turso.authToken'),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
