import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@Res() response: Response) {
    // La versión anterior solo confirmaba que Nest respondía, no que la BD estuviera realmente
    // conectada — un 200 no garantizaba nada sobre Turso. `SELECT 1` es la forma estándar de
    // probar la conexión sin depender de que exista una tabla de negocio en particular.
    const databaseStatus = await this.checkDatabase();
    const isHealthy = databaseStatus === 'ok';

    response
      .status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        status: isHealthy ? 'ok' : 'degraded',
        database: databaseStatus,
        timestamp: new Date().toISOString(),
      });
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      // No se expone el detalle del error de conexión (nunca fuga de info técnica al cliente,
      // ni siquiera en un endpoint de health) — solo el estado. El detalle real de Prisma ya
      // queda en los logs del proceso por su propio logger interno.
      return 'error';
    }
  }
}
