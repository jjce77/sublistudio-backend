import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'El código debe ser de 6 dígitos.' })
  code: string;
}
