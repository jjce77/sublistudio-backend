import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// Estados de Subscription (prisma/schema.prisma) — TASKS.md Fase 2: "Estados: activa,
// cancelada, vencida". Se repite el literal acá (en vez de importar desde el schema, que no
// genera un enum TS real para un campo String) para que quede validado en la capa HTTP.
export const SUBSCRIPTION_STATUSES = [
  'ACTIVA',
  'CANCELADA',
  'VENCIDA',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export class UpdateSubscriptionStatusDto {
  @ApiProperty({ enum: SUBSCRIPTION_STATUSES, example: 'CANCELADA' })
  @IsIn(SUBSCRIPTION_STATUSES, {
    message: 'status debe ser uno de: ACTIVA, CANCELADA, VENCIDA.',
  })
  status: SubscriptionStatus;
}
