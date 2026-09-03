import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'usuario@example.com' })
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  @MaxLength(255)
  email: string;

  // Regla de negocio propia (no viene del ADR): mínimo 8 caracteres + al menos una letra y un
  // número. 72 es el límite duro de bcrypt (trunca en silencio pasado ese largo) — se valida
  // explícito para no depender de ese comportamiento implícito.
  @ApiProperty({ example: 'ClaveSegura123' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir al menos una letra y un número.',
  })
  password: string;

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
}
