import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { GlobalVariableValueType } from '../types/global-variable-value-type.enum';

// Usado tanto para crear (POST) como para actualizar (PATCH) — el body es el mismo, solo
// cambia si `key` viene en el path (PATCH) o en el body (POST, ver CreateGlobalVariableDto).
export class UpsertGlobalVariableDto {
  @ApiProperty({
    enum: GlobalVariableValueType,
    example: GlobalVariableValueType.JSON,
  })
  @IsEnum(GlobalVariableValueType, {
    message: 'valueType debe ser SCALAR o JSON.',
  })
  valueType: GlobalVariableValueType;

  // Sin decorador de tipo específico a propósito: el valor real puede ser string, number,
  // boolean, objeto o arreglo según `valueType` — la validación de forma se hace en el
  // servicio/controller, no aquí, porque class-validator no puede tipar "cualquier JSON válido".
  @ApiProperty({ example: ['google'] })
  @IsNotEmpty({ message: 'value es obligatorio.' })
  value: unknown;

  @ApiProperty({ required: false, example: 'auth' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  scope?: string;

  @ApiProperty({
    required: false,
    example: 'Proveedores OAuth2 habilitados por un admin.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateGlobalVariableDto extends UpsertGlobalVariableDto {
  @ApiProperty({ example: 'oauth_enabled_providers' })
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key debe ser snake_case en minúsculas (a-z, 0-9, _).',
  })
  key: string;
}
