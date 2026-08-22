import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentOAuthProfile } from '../common/decorators/current-oauth-profile.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OAuthProviderName } from '../common/decorators/oauth-provider-name.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { OAuthProviderEnabledGuard } from '../common/guards/oauth-provider-enabled.guard';
import { AuthService, type SafeUser } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { OAuthProfile } from './oauth/oauth-profile.type';
import type { JwtPayload } from './types/jwt-payload.type';
import { REFRESH_TOKEN_COOKIE } from './strategies/jwt-refresh.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.register(dto);
    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { user, accessToken: tokens.accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // login es endpoint sensible (fuerza bruta) — CLAUDE.md
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.login(dto);
    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { user, accessToken: tokens.accessToken };
  }

  // OAuthProviderEnabledGuard corre ANTES que AuthGuard('google') — si el proveedor no existe
  // en el catálogo o no está habilitado por un admin, responde 404 sin llegar a iniciar el
  // handshake de Google (ver adr-sublistudio.md DEC-05).
  @Get('google')
  @OAuthProviderName('google')
  @UseGuards(OAuthProviderEnabledGuard, AuthGuard('google'))
  googleAuth(): void {
    // Nunca se ejecuta: Passport intercepta la request y redirige a Google antes de llegar aquí.
  }

  @Get('google/callback')
  @OAuthProviderName('google')
  @UseGuards(OAuthProviderEnabledGuard, AuthGuard('google'))
  async googleCallback(
    @CurrentOAuthProfile() profile: OAuthProfile,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, tokens } = await this.authService.loginWithOAuth(profile);
    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { user, accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const payload = request.user as JwtPayload;
    const tokens = await this.authService.refresh(payload.sub);
    this.setRefreshTokenCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) response: Response): { message: string } {
    // Alcance actual: sin almacén de refresh tokens emitidos/revocados, el logout es "best
    // effort" del lado del navegador (borra la cookie). Un refresh token ya copiado por un
    // atacante antes del logout seguiría siendo válido hasta su expiración natural. Cerrar esta
    // brecha requiere una tabla de sesiones/tokens (fuera del alcance de este primer corte del
    // módulo de Auth) — dejarlo anotado para Fase 1.x o Fase 9 (hardening).
    response.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });
    return { message: 'Sesión cerrada.' };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SafeUser): Promise<SafeUser> {
    return this.authService.getSafeUserById(user.id);
  }

  // No requiere sesión — es justamente para quien la perdió. Mismo criterio de throttling que
  // login (endpoint sensible a fuerza bruta/enumeración — CLAUDE.md).
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  // Email OTP: requiere sesión (el usuario ya inició sesión y está verificando SU propio email;
  // no es un paso previo al login). El límite es más ajustado que otp/verify porque cada envío
  // dispara un correo real.
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  sendOtp(@CurrentUser() user: SafeUser): Promise<{ message: string }> {
    return this.authService.sendEmailOtp(user.id);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(
    @CurrentUser() user: SafeUser,
    @Body() dto: VerifyOtpDto,
  ): Promise<{ message: string }> {
    return this.authService.verifyEmailOtp(user.id, dto);
  }

  // DEC-03: refresh token en cookie httpOnly + Secure + SameSite=None (frontend y backend en
  // dominios distintos). El scope `path: '/auth'` evita que la cookie viaje en cada request de
  // la API — solo en las llamadas a este controlador (login/refresh/logout la necesitan).
  //
  // CAVEAT de desarrollo local: `Secure` exige HTTPS, salvo la excepción que los navegadores
  // basados en Chromium aplican a `http://localhost` (lo tratan como "contexto seguro"). Si el
  // frontend se prueba en Firefox/Safari en localhost, esta cookie puede no llegar — validar al
  // integrar el frontend real; la alternativa sería relajar a `Secure:false` solo bajo
  // NODE_ENV=development, pero esta implementación prioriza que el comportamiento sea idéntico
  // entre entornos, tal como pide DEC-03.
  private setRefreshTokenCookie(
    response: Response,
    refreshToken: string,
  ): void {
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/auth',
      maxAge: this.refreshExpirationToMs(),
    });
  }

  // Convierte expresiones tipo "7d" / "15m" (formato aceptado por @nestjs/jwt) a milisegundos
  // para la cookie. Nest/jsonwebtoken no exponen un parser público de esto.
  private refreshExpirationToMs(): number {
    const DEFAULT_MS = 7 * 24 * 60 * 60 * 1000; // 7 días, si JWT_REFRESH_EXPIRATION viniera mal formado
    const expression =
      this.configService.get<string>('jwt.refreshExpiration') ?? '7d';
    const match = /^(\d+)([smhd])$/.exec(expression);
    if (!match) {
      return DEFAULT_MS;
    }

    const unitToMs: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return Number(match[1]) * unitToMs[match[2]];
  }
}
