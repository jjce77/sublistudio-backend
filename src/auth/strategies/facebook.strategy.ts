import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-facebook';
import { OAuthProfile } from '../oauth/oauth-profile.type';

// Handshake de Passport con Facebook y normalización del perfil en un solo lugar — mismo
// patrón que GoogleStrategy (ver el comentario ahí). Para activarla de verdad: agregar
// FacebookStrategy a los providers de AuthModule y sumar 'facebook' al arreglo de
// OAuthService; sin esos dos pasos esta clase existe pero es inalcanzable por la API.
@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('oauth.facebook.clientId'),
      clientSecret: configService.getOrThrow<string>(
        'oauth.facebook.clientSecret',
      ),
      callbackURL: configService.getOrThrow<string>(
        'oauth.facebook.callbackUrl',
      ),
      profileFields: ['id', 'emails', 'name', 'photos'],
      scope: ['email'],
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

  // Traduce el perfil crudo de Facebook a OAuthProfile. A diferencia de Google, Facebook NO
  // garantiza un email aunque se pida el scope "email": el usuario puede tener solo un
  // teléfono asociado a su cuenta, o negar el permiso en el diálogo de login — por eso este
  // caso se valida explícitamente en vez de asumir que profile.emails siempre existe.
  private normalizeProfile(rawProfile: Profile): OAuthProfile {
    const primaryEmail = rawProfile.emails?.[0]?.value;
    if (!primaryEmail) {
      throw new Error(
        'El perfil de Facebook no incluyó ningún email (permiso "email" no otorgado o cuenta sin correo verificado).',
      );
    }

    return {
      provider: 'facebook',
      providerId: rawProfile.id,
      email: primaryEmail,
      firstName: rawProfile.name?.givenName ?? rawProfile.displayName,
      lastName: rawProfile.name?.familyName ?? '',
      avatarUrl: rawProfile.photos?.[0]?.value,
    };
  }
}
