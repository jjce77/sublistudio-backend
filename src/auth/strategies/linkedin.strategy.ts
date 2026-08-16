import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy as OAuth2Strategy,
  StrategyOptions,
  VerifyCallback,
  VerifyFunction,
} from 'passport-oauth2';
import { OAuthProfile } from '../oauth/oauth-profile.type';

// Perfil que devuelve https://api.linkedin.com/v2/userinfo (formato estándar OpenID Connect:
// sub, email, given_name, family_name, picture, etc.).
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

interface LinkedinOidcUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

// LinkedIn descontinuó (agosto 2023) las scopes/API antiguas (r_liteprofile, r_emailaddress)
// que usan los paquetes passport-linkedin-* — casi ninguno se actualizó al reemplazo. Toda
// app nueva de LinkedIn solo tiene disponible el producto "Sign In with LinkedIn using OpenID
// Connect", que expone un endpoint de perfil estándar (OIDC userinfo) en vez del propietario
// que esos paquetes esperan. Por eso esta estrategia extiende el Strategy OAuth2 genérico de
// Passport y solo le agrega DÓNDE pedir el perfil — el resto del ciclo (authorize → callback →
// token) es OAuth2 estándar, sin nada específico de LinkedIn más que esa URL.
class LinkedinOidcStrategy extends OAuth2Strategy {
  constructor(options: StrategyOptions, verify: VerifyFunction) {
    super(options, verify);
    // LinkedIn exige el access token como header "Authorization: Bearer ...", no como query
    // param (que es el default de node-oauth para peticiones GET).
    this._oauth2.useAuthorizationHeaderforGET(true);
  }

  userProfile(
    accessToken: string,
    done: (error: Error | null, profile?: unknown) => void,
  ): void {
    this._oauth2.get(LINKEDIN_USERINFO_URL, accessToken, (error, body) => {
      if (error || !body) {
        done(new Error('No se pudo obtener el perfil de LinkedIn.'));
        return;
      }
      try {
        done(null, JSON.parse(body.toString()) as LinkedinOidcUserInfo);
      } catch {
        done(new Error('Respuesta de perfil de LinkedIn inválida.'));
      }
    });
  }
}

// Handshake de Passport con LinkedIn y normalización del perfil en un solo lugar — mismo
// patrón que GoogleStrategy (ver el comentario ahí). Para activarla de verdad: agregar
// LinkedinStrategy a los providers de AuthModule y sumar 'linkedin' al arreglo de
// OAuthService; sin esos dos pasos esta clase existe pero es inalcanzable por la API.
@Injectable()
export class LinkedinStrategy extends PassportStrategy(
  LinkedinOidcStrategy,
  'linkedin',
) {
  constructor(configService: ConfigService) {
    super({
      authorizationURL: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenURL: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientID: configService.getOrThrow<string>('oauth.linkedin.clientId'),
      clientSecret: configService.getOrThrow<string>(
        'oauth.linkedin.clientSecret',
      ),
      callbackURL: configService.getOrThrow<string>(
        'oauth.linkedin.callbackUrl',
      ),
      scope: ['openid', 'profile', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: LinkedinOidcUserInfo,
    done: VerifyCallback,
  ): void {
    try {
      done(null, this.normalizeProfile(profile));
    } catch (error) {
      done(error as Error, undefined);
    }
  }

  private normalizeProfile(rawProfile: LinkedinOidcUserInfo): OAuthProfile {
    if (!rawProfile.email) {
      throw new Error(
        'El perfil de LinkedIn no incluyó ningún email — falta el scope "email" en la app de LinkedIn Developer Portal.',
      );
    }

    return {
      provider: 'linkedin',
      providerId: rawProfile.sub,
      email: rawProfile.email,
      firstName: rawProfile.given_name ?? rawProfile.name ?? '',
      lastName: rawProfile.family_name ?? '',
      avatarUrl: rawProfile.picture,
    };
  }
}
