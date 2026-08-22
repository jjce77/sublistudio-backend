import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido por correo en el flujo de "olvidé mi contraseña".' })
  @IsString()
  token: string;

  // Misma regla que RegisterDto.password — ver el comentario ahí (mínimo 8, letra+número, 72
  // como límite duro de bcrypt).
  @ApiProperty({ example: 'ClaveNuevaSegura123' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres.' })
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'La contraseña debe incluir al menos una letra y un número.',
  })
  newPassword: string;
}
