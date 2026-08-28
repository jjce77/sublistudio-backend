import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type SafeUser } from '../auth/auth.service';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// Panel admin de gestión de usuarios (TASKS.md Fase 2). Todo el controller detrás de
// JwtAuthGuard + RolesGuard(SUPERADMIN, ADMINISTRADOR) — mismo criterio que
// GlobalVariablesController. Reglas de privilegio más finas (ej. solo Superadmin puede tocar
// otra cuenta Superadmin, nadie se bloquea/elimina a sí mismo) viven en UsersService, no acá.
@ApiTags('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_SLUGS.SUPERADMIN, ROLE_SLUGS.ADMINISTRADOR)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(
    @Query('roleSlug') roleSlug?: string,
    @Query('isBlocked') isBlocked?: string,
  ) {
    return this.usersService.list({
      roleSlug,
      isBlocked: isBlocked === undefined ? undefined : isBlocked === 'true',
    });
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() admin: SafeUser) {
    return this.usersService.create(dto, admin);
  }

  // Alta manual placeholder de "usuario provisto tras pago validado" (Fase 2) — reutilizable
  // por el webhook de pagos real cuando exista (Fase 8). Ver UsersService.provisionFromPayment.
  @Post('provision')
  provision(@Body() dto: ProvisionUserDto, @CurrentUser() admin: SafeUser) {
    return this.usersService.provisionFromPayment(dto, admin);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOneOrThrow(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: SafeUser,
  ) {
    return this.usersService.update(id, dto, admin);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: SafeUser,
  ) {
    await this.usersService.softDelete(id, admin);
  }

  @Patch(':id/block')
  block(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: SafeUser) {
    return this.usersService.block(id, admin);
  }

  @Patch(':id/unblock')
  unblock(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: SafeUser,
  ) {
    return this.usersService.unblock(id, admin);
  }

  @Get(':id/audit-logs')
  auditLogs(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getAuditLogs(id);
  }

  @Get(':id/subscriptions')
  listSubscriptions(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.listSubscriptions(id);
  }

  @Patch(':id/subscriptions/:subscriptionId')
  updateSubscriptionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('subscriptionId', ParseIntPipe) subscriptionId: number,
    @Body() dto: UpdateSubscriptionStatusDto,
    @CurrentUser() admin: SafeUser,
  ) {
    return this.usersService.updateSubscriptionStatus(
      id,
      subscriptionId,
      dto,
      admin,
    );
  }
}
