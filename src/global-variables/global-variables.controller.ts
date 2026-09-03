import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { type SafeUser } from '../auth/auth.service';
import {
  CreateGlobalVariableDto,
  UpsertGlobalVariableDto,
} from './dto/upsert-global-variable.dto';
import { GlobalVariablesService } from './global-variables.service';
import { GlobalVariableValueType } from './types/global-variable-value-type.enum';

// "Almacén editable solo por admin" (CLAUDE.md) — todo el controller queda detrás de
// JwtAuthGuard + RolesGuard(SUPERADMIN, ADMINISTRADOR). No hay lectura pública: cualquier
// módulo interno que necesite leer una variable global lo hace inyectando
// GlobalVariablesService directamente, no vía HTTP.
@ApiTags('admin/global-variables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_SLUGS.SUPERADMIN, ROLE_SLUGS.ADMINISTRADOR)
@Controller('admin/global-variables')
export class GlobalVariablesController {
  constructor(
    private readonly globalVariablesService: GlobalVariablesService,
  ) {}

  @Get()
  list() {
    return this.globalVariablesService.listAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.globalVariablesService.findOneOrThrow(key);
  }

  @Post()
  create(@Body() dto: CreateGlobalVariableDto, @CurrentUser() admin: SafeUser) {
    return this.upsertByType(dto.key, dto, admin.id);
  }

  // PUT (no PATCH): el body reemplaza el valor completo — no hay merge parcial de JSON, ni
  // falta que lo haya para el alcance actual (leer/escribir por key completo).
  @Put(':key')
  update(
    @Param('key') key: string,
    @Body() dto: UpsertGlobalVariableDto,
    @CurrentUser() admin: SafeUser,
  ) {
    return this.upsertByType(key, dto, admin.id);
  }

  // El body manda el valor "desenvuelto" (ej. "value": 50, no "value": {"value": 50}) — el
  // envoltorio de los escalares es un detalle de almacenamiento interno (ver comentario en el
  // schema y en GlobalVariablesService), no algo que el admin que llama a esta API deba conocer.
  private upsertByType(
    key: string,
    dto: UpsertGlobalVariableDto,
    adminId: number,
  ) {
    const options = { scope: dto.scope, description: dto.description };
    return dto.valueType === GlobalVariableValueType.SCALAR
      ? this.globalVariablesService.setScalar(
          key,
          dto.value as string | number | boolean,
          options,
          adminId,
        )
      : this.globalVariablesService.setJson(
          key,
          dto.value as never,
          options,
          adminId,
        );
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('key') key: string, @CurrentUser() admin: SafeUser) {
    await this.globalVariablesService.softDelete(key, admin.id);
  }
}
