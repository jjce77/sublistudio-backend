import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'usuario@example.com' })
  @IsEmail({}, { message: 'El email no tiene un formato válido.' })
  email: string;

  @ApiProperty()
  @IsString()
  password: string;
}
