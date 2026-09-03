import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'usuario@example.com' })
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  email: string;
}
