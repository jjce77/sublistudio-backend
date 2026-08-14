import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthAdminController } from './oauth/oauth-admin.controller';
import { OAuthProviderConfigService } from './oauth/oauth-provider-config.service';
import { OAuthService } from './oauth/oauth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  // JwtModule.register({}) sin secret/expiresIn globales a propósito: access y refresh usan
  // secretos y duraciones distintas, se pasan explícitos en cada signAsync (ver AuthService).
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, OAuthAdminController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    // Arquitectura OAuth2: agregar un proveedor nuevo significa
    // crear su <Nombre>Strategy (handshake + normalización juntos), agregarla aquí, y sumar su
    // nombre al arreglo de OAuthService — nada más de este módulo cambia.
    GoogleStrategy,
    OAuthService,
    OAuthProviderConfigService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
