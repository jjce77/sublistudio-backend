import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLE_SLUGS } from '../../common/constants/role.constant';
import type { RoleSlug } from '../../common/constants/role.constant';

// Alta manual desde el panel admin (TASKS.md Fase 2: "CRUD usuarios en panel admin — registrar
// ... alta ... manual"). Si no se manda `password`, el servicio genera una contraseña aleatoria
// segura y la envía por correo — mismo mecanismo que reutiliza la automatización post-pago (ver
// UsersService.provisionFromPayment).
export class CreateUserDto {
  @ApiProperty({ example: 'usuario@example.com' })
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
    enum: Object.values(ROLE_SLUGS),
    example: ROLE_SLUGS.USUARIO,
  })
  @IsEnum(ROLE_SLUGS, {
    message: 'roleSlug debe ser uno de los 4 roles válidos.',
  })
  roleSlug: RoleSlug;

  @ApiPropertyOptional({
    example: 'ClaveSegura123',
    description:
      'Si se omite, el sistema genera una contraseña aleatoria y la envía por correo al usuario.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir al menos una letra y un número.',
  })
  password?: string;
}
