import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLE_SLUGS } from '../../common/constants/role.constant';
import type { RoleSlug } from '../../common/constants/role.constant';

// Edición de perfil desde el panel admin (TASKS.md Fase 2: "modificar"). No incluye `password`
// (ver flujo de reset en AuthController) ni toca `isBlocked`/`deletedAt` — esos tienen
// endpoints dedicados (block/unblock, delete) para que quede claro en el audit log qué acción
// de negocio ocurrió, en vez de inferirlo de un PATCH genérico.
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'nuevo-email@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'Ana' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'García' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ enum: Object.values(ROLE_SLUGS) })
  @IsOptional()
  @IsEnum(ROLE_SLUGS, {
    message: 'roleSlug debe ser uno de los 4 roles válidos.',
  })
  roleSlug?: RoleSlug;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @ApiPropertyOptional({ example: '@usuario' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  telegram?: string;

  @ApiPropertyOptional({ example: 'México' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'CDMX' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Calle Falsa 123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}
