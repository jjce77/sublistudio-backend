import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { OAuthProfile } from '../../auth/oauth/oauth-profile.type';

// Extrae el OAuthProfile normalizado que la estrategia de Passport del proveedor (ej.
// GoogleStrategy) dejó en req.user tras el handshake — distinto de CurrentUser (que lee un
// SafeUser ya autenticado por JWT). Usado solo en los endpoints .../callback de OAuth2.
export const CurrentOAuthProfile = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OAuthProfile => {
    const request = ctx.switchToHttp().getRequest<{ user: OAuthProfile }>();
    return request.user;
  },
);
