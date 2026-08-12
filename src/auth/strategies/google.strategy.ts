import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { OAuthProfile } from '../oauth/oauth-profile.type';

// Handshake de Passport con Google y normalización del perfil en un solo lugar. Antes esto
// vivía en dos clases (GoogleStrategy + GoogleOAuthProvider); con un único proveedor, esa
// separación no compraba nada. Si el día que agregues un segundo/tercer proveedor aparece un
// patrón real repetido entre estrategias, se extrae de nuevo — no antes de que ese patrón
// exista de verdad (ver adr-sublistudio.md DEC-05).
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('oauth.google.clientId'),
      clientSecret: configService.getOrThrow<string>(
        'oauth.google.clientSecret',
      ),
      callbackURL: configService.getOrThrow<string>('oauth.google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    try {
      done(null, this.normalizeProfile(profile));
    } catch (error) {
      done(error as Error, undefined);
    }
  }

  // Traduce el perfil crudo de Google (forma específica de su SDK) a OAuthProfile — la forma
  // común que AuthService.loginWithOAuth() conoce, sin ver nunca el payload real de Google.
  // Google siempre entrega al menos un email con el scope "email"; si esto falla es un problema
  // de configuración del scope solicitado, no un caso de negocio a manejar en silencio.
  private normalizeProfile(rawProfile: Profile): OAuthProfile {
    const primaryEmail = rawProfile.emails?.[0]?.value;
    if (!primaryEmail) {
      throw new Error('El perfil de Google no incluyó ningún email.');
    }

    return {
      provider: 'google',
      providerId: rawProfile.id,
      email: primaryEmail,
      firstName: rawProfile.name?.givenName ?? rawProfile.displayName,
      lastName: rawProfile.name?.familyName ?? '',
      avatarUrl: rawProfile.photos?.[0]?.value,
    };
  }
}
