import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Placeholder reutilizable de "tras pago validado, generar usuario + contraseña únicos, enviar
// por correo" (TASKS.md Fase 2). Todavía no existe pasarela de pagos (Fase 8) que dispare esto
// automáticamente vía webhook — este endpoint deja la lógica lista y probada
// (UsersService.provisionFromPayment) para que ese webhook la invoque directo cuando exista, y
// mientras tanto le sirve a un admin para dar de alta manual a un cliente que ya pagó por fuera
// del sistema.
export class ProvisionUserDto {
  @ApiProperty({ example: 'cliente@example.com' })
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({
    example: 1,
    description: 'ID del Plan contratado (prisma/schema.prisma → Plan).',
  })
  @IsInt()
  @IsPositive()
  planId: number;

  @ApiPropertyOptional({
    example: 'pi_123456',
    description:
      'Referencia del pago en la pasarela externa (Subscription.paymentGatewayRef).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paymentGatewayRef?: string;
}
