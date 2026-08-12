import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OAuthProviderConfigService } from '../../auth/oauth/oauth-provider-config.service';
import { OAuthService } from '../../auth/oauth/oauth.service';
import { OAUTH_PROVIDER_NAME_KEY } from '../decorators/oauth-provider-name.decorator';

// Protege cada endpoint de login/callback OAuth2 (ej. GET /auth/google, GET
// /auth/google/callback), marcado con @OAuthProviderName('google'). Rechaza con 404 tanto un
// proveedor inexistente en código como uno existente pero deshabilitado por el admin — mismo
// mensaje en ambos casos, para no revelarle a un usuario no autenticado qué proveedores están
// soportados (ver adr-sublistudio.md DEC-05).
@Injectable()
export class OAuthProviderEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly oauthService: OAuthService,
    private readonly oauthProviderConfig: OAuthProviderConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const providerName = this.reflector.getAllAndOverride<string | undefined>(
      OAUTH_PROVIDER_NAME_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Error de programación (falta el decorator en el handler), no un caso de negocio a manejar
    // silencioso — por eso NO se atrapa como 404 genérico.
    if (!providerName) {
      throw new Error(
        'OAuthProviderEnabledGuard requiere @OAuthProviderName() en el handler.',
      );
    }

    if (!this.oauthService.findProvider(providerName)) {
      throw new NotFoundException();
    }
    if (!(await this.oauthProviderConfig.isEnabled(providerName))) {
      throw new NotFoundException();
    }

    return true;
  }
}
