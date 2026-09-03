import { Injectable } from '@nestjs/common';
import { GlobalVariablesService } from '../../global-variables/global-variables.service';

// key de Variables Globales donde se persiste qué proveedores OAuth2 están habilitados.
// Valor: arreglo JSON de nombres de proveedor, ej. ["google"].
const OAUTH_ENABLED_PROVIDERS_KEY = 'oauth_enabled_providers';

// Responsabilidad única: "¿qué proveedores del catálogo activó un admin?", persistido vía
// Variables Globales (nunca en .env ni hardcodeado — ver adr-sublistudio.md DEC-05). No sabe
// nada de Passport, estrategias, ni del catálogo de proveedores (OAuthService) — se componen
// desde afuera (ver OAuthProviderEnabledGuard y OAuthAdminController).
@Injectable()
export class OAuthProviderConfigService {
  constructor(private readonly globalVariables: GlobalVariablesService) {}

  async isEnabled(providerName: string): Promise<boolean> {
    const enabled = await this.getEnabledProviders();
    return enabled.includes(providerName);
  }

  async getEnabledProviders(): Promise<string[]> {
    return (
      (await this.globalVariables.getJson<string[]>(
        OAUTH_ENABLED_PROVIDERS_KEY,
      )) ?? []
    );
  }

  // Todo proveedor nace inactivo por defecto — esta es la única forma de habilitarlo.
  async setEnabled(
    providerName: string,
    enabled: boolean,
    adminUserId: number,
  ): Promise<void> {
    const current = await this.getEnabledProviders();
    const next = enabled
      ? [...new Set([...current, providerName])]
      : current.filter((name) => name !== providerName);

    await this.globalVariables.setJson(
      OAUTH_ENABLED_PROVIDERS_KEY,
      next,
      {
        scope: 'auth',
        description:
          'Proveedores OAuth2 habilitados por un administrador (ver adr-sublistudio.md DEC-05).',
      },
      adminUserId,
    );
  }
}
