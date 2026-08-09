import { Injectable, NotFoundException } from '@nestjs/common';
import { GlobalVariable, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalVariableValueType } from './types/global-variable-value-type.enum';

export interface UpsertGlobalVariableOptions {
  scope?: string;
  description?: string;
}

// Interfaz única de lectura/escritura para el almacén de Variables Globales (CLAUDE.md,
// TASKS.md Fase 1 — "Módulos transversales"). Cualquier otro módulo del backend que necesite
// configuración editable en runtime por un admin (ej. el catálogo de proveedores OAuth
// habilitados, ver adr-sublistudio.md DEC-05) pasa por este servicio en vez de tocar la tabla
// `global_variables` directamente.
//
// Alcance actual: solo lectura/escritura por `key` (sin filtrar por contenido interno del
// JSON). Ese alcance no necesita SQL específico de motor — el campo `value` es `Json` en
// Prisma y se serializa/deserializa igual en los 4 motores soportados (turso-sqlite,
// sqlite, postgresql, mysql). Si en el futuro se necesita filtrar POR una clave interna del
// JSON a nivel de BD, eso sí requiere una solución por motor (Postgres no tiene
// `json_extract()`) — ver nota agregada en DEC-02.
@Injectable()
export class GlobalVariablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Lee un valor escalar (número, string o boolean). `null` si la key no existe o está borrada. */
  async getScalar<T extends string | number | boolean>(
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<T | null> {
    const record = await this.findActiveByKey(key, tx);
    if (
      !record ||
      record.valueType !== (GlobalVariableValueType.SCALAR as string)
    ) {
      return null;
    }
    const wrapped = record.value as { value: T };
    return wrapped.value;
  }

  /** Lee un valor JSON (objeto o arreglo). `null` si la key no existe o está borrada. */
  async getJson<T>(
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<T | null> {
    const record = await this.findActiveByKey(key, tx);
    if (
      !record ||
      record.valueType !== (GlobalVariableValueType.JSON as string)
    ) {
      return null;
    }
    return record.value as T;
  }

  /** Crea o actualiza un valor escalar. Auditado siempre — es una acción de negocio (CLAUDE.md). */
  async setScalar(
    key: string,
    value: string | number | boolean,
    options: UpsertGlobalVariableOptions,
    adminUserId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<GlobalVariable> {
    return this.upsert(
      key,
      GlobalVariableValueType.SCALAR,
      { value },
      options,
      adminUserId,
      tx,
    );
  }

  /** Crea o actualiza un valor JSON. Auditado siempre — es una acción de negocio (CLAUDE.md). */
  async setJson<T extends Prisma.InputJsonValue>(
    key: string,
    value: T,
    options: UpsertGlobalVariableOptions,
    adminUserId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<GlobalVariable> {
    return this.upsert(
      key,
      GlobalVariableValueType.JSON,
      value,
      options,
      adminUserId,
      tx,
    );
  }

  /** Listado completo para el panel de administración (excluye borradas). */
  async listAll(): Promise<GlobalVariable[]> {
    return this.prisma.globalVariable.findMany({
      where: { deletedAt: null },
      orderBy: { key: 'asc' },
    });
  }

  async findOneOrThrow(key: string): Promise<GlobalVariable> {
    const record = await this.findActiveByKey(key);
    if (!record) {
      throw new NotFoundException(`No existe la variable global "${key}".`);
    }
    return record;
  }

  /** Soft delete — igual que el resto del schema (DEC-06), nunca se borra físicamente. */
  async softDelete(key: string, adminUserId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.globalVariable.findFirst({
        where: { key, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(`No existe la variable global "${key}".`);
      }

      await tx.globalVariable.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.record(
        {
          module: 'global_variables',
          action: 'DELETE',
          entityType: 'GlobalVariable',
          entityId: existing.id,
          userId: adminUserId,
          payload: { key },
        },
        tx,
      );
    });
  }

  private async findActiveByKey(
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<GlobalVariable | null> {
    const client = tx ?? this.prisma;
    return client.globalVariable.findFirst({ where: { key, deletedAt: null } });
  }

  private async upsert(
    key: string,
    valueType: GlobalVariableValueType,
    value: Prisma.InputJsonValue,
    options: UpsertGlobalVariableOptions,
    adminUserId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<GlobalVariable> {
    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.globalVariable.findFirst({
        where: { key, deletedAt: null },
      });

      const record = existing
        ? await client.globalVariable.update({
            where: { id: existing.id },
            data: {
              valueType,
              value,
              scope: options.scope,
              description: options.description,
            },
          })
        : await client.globalVariable.create({
            data: {
              key,
              valueType,
              value,
              scope: options.scope,
              description: options.description,
            },
          });

      await this.auditService.record(
        {
          module: 'global_variables',
          action: existing ? 'UPDATE' : 'CREATE',
          entityType: 'GlobalVariable',
          entityId: record.id,
          userId: adminUserId,
          payload: { key, valueType },
        },
        client,
      );

      return record;
    };

    // Si el llamador ya abrió una transacción (ej. otro módulo que necesita atomicidad entre su
    // propia escritura y esta variable global), se reutiliza esa misma transacción. Si no, se
    // abre una propia — el upsert + su auditoría deben ser atómicos entre sí de todos modos.
    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}
