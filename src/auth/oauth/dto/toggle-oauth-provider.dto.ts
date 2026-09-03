import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleOAuthProviderDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled: boolean;
}
