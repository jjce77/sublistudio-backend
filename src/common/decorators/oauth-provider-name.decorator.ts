import { SetMetadata } from '@nestjs/common';

export const OAUTH_PROVIDER_NAME_KEY = 'oauthProviderName';

// Mismo patrón que @Roles()/RolesGuard: declara metadata en el handler que el guard lee vía
// Reflector — evita depender de un route param (:provider) para saber qué proveedor valida
// este endpoint en particular.
export const OAuthProviderName = (name: string) =>
  SetMetadata(OAUTH_PROVIDER_NAME_KEY, name);
