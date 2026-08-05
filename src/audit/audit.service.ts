import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntryInput {
  /** Módulo que originó la acción, ej. "auth", "users", "resources", "payments". */
  module: string;
  /** "CREATE" | "UPDATE" | "DELETE" | "PAY" | "UPLOAD" (u otro string libre si se necesita). */
  action: string;
  entityType: string;
  entityId?: number;
  userId?: number;
  payload?: Record<string, unknown>;
}

// Regla no negociable (CLAUDE.md): "Cualquier acción de negocio (crear/modificar/eliminar/
// pagar/cargar) debe pasar por el módulo de auditoría, en la misma transacción." Por eso
// `record` acepta un `tx` opcional (Prisma.TransactionClient): el llamador que ya abrió un
// `$transaction` para su propia escritura de negocio debe pasarlo aquí, para que el registro de
// auditoría viva o muera con esa misma transacción (DEC-01). Sin `tx`, escribe directo — solo
// válido para llamadas que no forman parte de una transacción de negocio más amplia.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntryInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        module: entry.module,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        userId: entry.userId,
        payload: entry.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
