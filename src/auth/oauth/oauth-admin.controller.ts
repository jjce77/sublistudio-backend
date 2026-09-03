import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ROLE_SLUGS } from '../../common/constants/role.constant';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { type SafeUser } from '../auth.service';
import { ToggleOAuthProviderDto } from './dto/toggle-oauth-provider.dto';
import { OAuthProviderConfigService } from './oauth-provider-config.service';
import { OAuthService } from './oauth.service';

interface OAuthProviderStatus {
  provider: string;
  isEnabled: boolean;
}

// Facade de administración: es la única clase que conoce tanto el catálogo de proveedores
// (OAuthService) como su activación persistida (OAuthProviderConfigService) — ninguna de las
// dos se conoce entre sí (ver adr-sublistudio.md DEC-05).
@ApiTags('admin/oauth-providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_SLUGS.SUPERADMIN, ROLE_SLUGS.ADMINISTRADOR)
@Controller('admin/oauth-providers')
export class OAuthAdminController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly oauthProviderConfig: OAuthProviderConfigService,
  ) {}

  @Get()
  async list(): Promise<OAuthProviderStatus[]> {
    const available = this.oauthService.listAvailableProviders();
    const enabled = await this.oauthProviderConfig.getEnabledProviders();

    return available.map((provider) => ({
      provider,
      isEnabled: enabled.includes(provider),
    }));
  }

  @Put(':provider')
  async toggle(
    @Param('provider') provider: string,
    @Body() dto: ToggleOAuthProviderDto,
    @CurrentUser() admin: SafeUser,
  ): Promise<OAuthProviderStatus> {
    // Valida contra el catálogo ANTES de persistir — evita que alguien habilite por API un
    // nombre de proveedor que no existe en código.
    if (!this.oauthService.findProvider(provider)) {
      throw new NotFoundException(`El proveedor "${provider}" no existe.`);
    }

    await this.oauthProviderConfig.setEnabled(
      provider,
      dto.isEnabled,
      admin.id,
    );

    return { provider, isEnabled: dto.isEnabled };
  }
}
