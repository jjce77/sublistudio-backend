import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OAuthProfile } from './oauth/oauth-profile.type';
import { JwtPayload } from './types/jwt-payload.type';

// Hash bcrypt "señuelo" (de una contraseña aleatoria descartada, no de una cuenta real) contra
// el que se compara cuando no hay contraseña real disponible (email inexistente o cuenta 100%
// OAuth). Sin esto, `bcrypt.compare` se saltaría y la respuesta sería más rápida en esos casos,
// delatando por timing lo que el mensaje genérico ya intenta ocultar (DEC-05).
const DUMMY_PASSWORD_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Yv0lqzz6b5PZ2mSAvdxeqYzR6qYb2';

// Recuperación de contraseña (DEC-05): el token vive 30 minutos.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// Email OTP: código de 6 dígitos vigente 10 minutos.
const OTP_TTL_MS = 10 * 60 * 1000;
const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message:
    'Si el email existe, recibirás instrucciones para restablecer tu contraseña.',
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: number;
  email: string;
  fullName: string;
  roleSlug: string;
}

export interface AuthResult {
  user: SafeUser;
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  // NOTA de alcance: hoy no existe un flujo de registro público definido en TASKS.md (Fase 2
  // automatiza la creación de usuario tras un pago validado). Este endpoint asigna el rol de
  // menor privilegio (USUARIO) para no adelantar una decisión de negocio que no está tomada —
  // confirmar con el equipo si el registro público debe existir tal cual, o si debe
  // deshabilitarse hasta Fase 2.
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con ese email.',
      );
    }

    const defaultRole = await this.prisma.role.findUnique({
      where: { slug: ROLE_SLUGS.USUARIO },
    });
    if (!defaultRole) {
      // Error de configuración del entorno (falta correr el seed), no un error del usuario final
      // — el filtro global lo enmascara al cliente y deja este detalle en el log interno.
      throw new Error(
        `Rol por defecto "${ROLE_SLUGS.USUARIO}" no existe en la base de datos. Corre "npm run db:seed".`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          authMethod: 'local',
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          roleId: defaultRole.id,
        },
      });

      // Misma transacción que la creación del usuario (CLAUDE.md: auditoría no negociable).
      await this.auditService.record(
        {
          module: 'auth',
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          payload: { email: user.email },
        },
        tx,
      );

      return user;
    });

    const tokens = await this.issueTokens({
      sub: createdUser.id,
      roleSlug: defaultRole.slug,
    });

    return {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        roleSlug: defaultRole.slug,
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    // DEC-05 (previene User Enumeration): los 3 casos de fallo — email inexistente, cuenta
    // 100% OAuth (passwordHash NULL), contraseña incorrecta — deben ser indistinguibles para
    // quien llama, en mensaje Y en tiempo de respuesta. Por eso SIEMPRE se ejecuta un
    // bcrypt.compare, contra el hash real si existe o contra el señuelo si no.
    const canAttemptPasswordLogin =
      user !== null && user.deletedAt === null && user.passwordHash !== null;
    // La condición se repite (en vez de reusar canAttemptPasswordLogin) para que TypeScript
    // pueda angostar `user.passwordHash` a `string` dentro de esta misma expresión.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user && user.deletedAt === null && user.passwordHash
        ? user.passwordHash
        : DUMMY_PASSWORD_HASH,
    );

    if (!canAttemptPasswordLogin || !passwordMatches || !user) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // A partir de aquí la contraseña ya es correcta — decir "cuenta bloqueada" no es un vector
    // de enumeración (quien pregunta ya demostró conocer la contraseña real).
    if (user.isBlocked) {
      throw new ForbiddenException(
        'Tu cuenta está bloqueada. Contacta a soporte.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens({
      sub: user.id,
      roleSlug: user.role.slug,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleSlug: user.role.slug,
      },
      tokens,
    };
  }

  // Punto de entrada único para CUALQUIER proveedor OAuth2 — solo conoce OAuthProfile (forma
  // normalizada), nunca el payload específico de Google/Facebook/etc. (ver adr-sublistudio.md
  // DEC-05, "Arquitectura de proveedores OAuth2"). Llamado desde el callback de cada proveedor
  // vía OAuthProviderEnabledGuard + AuthGuard(providerName).
  async loginWithOAuth(profile: OAuthProfile): Promise<AuthResult> {
    const existingByProvider = await this.prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider,
          providerId: profile.providerId,
        },
      },
      include: { role: true },
    });

    const user = existingByProvider
      ? await this.reactivateOAuthUser(existingByProvider.id)
      : await this.linkOrCreateOAuthUser(profile);

    if (user.isBlocked) {
      throw new ForbiddenException(
        'Tu cuenta está bloqueada. Contacta a soporte.',
      );
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      roleSlug: user.role.slug,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleSlug: user.role.slug,
      },
      tokens,
    };
  }

  private async reactivateOAuthUser(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
      include: { role: true },
    });
  }

  // Si ya existe una cuenta local con ese email, se vincula el proveedor a esa cuenta
  // (authMethod pasa a "both") en vez de crear un duplicado. Si no existe, se crea una cuenta
  // 100% OAuth (passwordHash null, authMethod = nombre del proveedor).
  private async linkOrCreateOAuthUser(profile: OAuthProfile) {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { role: true },
    });

    if (existingByEmail) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: existingByEmail.id },
          data: {
            provider: profile.provider,
            providerId: profile.providerId,
            authMethod: existingByEmail.passwordHash
              ? 'both'
              : profile.provider,
            avatarUrl: existingByEmail.avatarUrl ?? profile.avatarUrl,
            emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
            lastLoginAt: new Date(),
          },
          include: { role: true },
        });

        await this.auditService.record(
          {
            module: 'auth',
            action: 'UPDATE',
            entityType: 'User',
            entityId: updated.id,
            userId: updated.id,
            payload: { linkedProvider: profile.provider },
          },
          tx,
        );

        return updated;
      });
    }

    const defaultRole = await this.prisma.role.findUnique({
      where: { slug: ROLE_SLUGS.USUARIO },
    });
    if (!defaultRole) {
      throw new Error(
        `Rol por defecto "${ROLE_SLUGS.USUARIO}" no existe en la base de datos. Corre "npm run db:seed".`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: profile.email,
          passwordHash: null,
          authMethod: profile.provider,
          provider: profile.provider,
          providerId: profile.providerId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName: `${profile.firstName} ${profile.lastName}`.trim(),
          avatarUrl: profile.avatarUrl,
          // Google (y proveedores OAuth2 en general) ya verificaron el email por su cuenta.
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          roleId: defaultRole.id,
        },
        include: { role: true },
      });

      await this.auditService.record(
        {
          module: 'auth',
          action: 'CREATE',
          entityType: 'User',
          entityId: created.id,
          userId: created.id,
          payload: { email: created.email, provider: profile.provider },
        },
        tx,
      );

      return created;
    });
  }

  async refresh(userId: number): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.deletedAt || user.isBlocked) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    // Rotación de refresh token en cada uso: reduce la ventana de uso de un refresh token
    // robado. NOTA de alcance: sin un almacén de tokens emitidos/revocados todavía, esto NO
    // invalida el token anterior — solo emite uno nuevo. Ver limitación en README del módulo.
    return this.issueTokens({ sub: user.id, roleSlug: user.role.slug });
  }

  // DEC-05: la respuesta HTTP es idéntica exista o no el email, y también si la cuenta es 100%
  // OAuth — la diferencia entre esos 3 casos se refleja SOLO en qué correo se envía (o si se
  // envía alguno), nunca en lo que recibe quien llama a este endpoint. A diferencia de login()
  // no se busca aquí igualar el tiempo de respuesta con un trabajo "señuelo": el costo de este
  // flujo lo domina el envío del correo (fire-and-forget), no una comparación criptográfica.
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt) {
      return GENERIC_FORGOT_PASSWORD_RESPONSE;
    }

    if (!user.passwordHash) {
      // Cuenta 100% OAuth: no hay contraseña que restablecer, así que NUNCA se genera token acá
      // — solo se informa por correo, sin filtrar ese detalle en la respuesta HTTP.
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Recuperación de contraseña',
        text: `Tu cuenta de SubliStudio inicia sesión con ${user.provider ?? 'un proveedor externo'}. No tiene una contraseña que restablecer — inicia sesión con ese método.`,
      });
      return GENERIC_FORGOT_PASSWORD_RESPONSE;
    }

    const { token, hash } = this.buildResetToken(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash: hash,
        resetPasswordTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Recuperación de contraseña',
      text: `Para restablecer tu contraseña (el link expira en 30 minutos), abrí: ${this.buildFrontendResetLink(token)}`,
    });

    return GENERIC_FORGOT_PASSWORD_RESPONSE;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const parsed = this.parseResetToken(dto.token);
    const user = parsed
      ? await this.prisma.user.findUnique({ where: { id: parsed.userId } })
      : null;

    const isValid =
      parsed !== null &&
      user !== null &&
      user.deletedAt === null &&
      this.isFreshToken(
        user.resetPasswordTokenHash,
        user.resetPasswordTokenExpiresAt,
        this.hashResetSecret(parsed.secret),
      );

    if (!isValid || !user) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Token de un solo uso: se invalida apenas se consume, exitosamente o no volvería a
          // intentarse con el mismo — evita reutilización si el correo quedó expuesto.
          resetPasswordTokenHash: null,
          resetPasswordTokenExpiresAt: null,
        },
      });

      await this.auditService.record(
        {
          module: 'auth',
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          payload: { passwordReset: true },
        },
        tx,
      );
    });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  // Email OTP — hoy cubre verificación de email (no 2FA en cada login, que es un cambio de
  // comportamiento del flujo de login en sí y queda fuera de este alcance; ver TASKS.md).
  async sendEmailOtp(userId: number): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    if (user.emailVerifiedAt) {
      return { message: 'Tu email ya está verificado.' };
    }

    const code = String(randomInt(100000, 1000000));

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode: code, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Código de verificación de SubliStudio',
      text: `Tu código de verificación es ${code}. Expira en 10 minutos.`,
    });

    return { message: 'Código enviado a tu correo.' };
  }

  async verifyEmailOtp(
    userId: number,
    dto: VerifyOtpDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const isValid =
      user !== null &&
      user.deletedAt === null &&
      user.otpCode !== null &&
      user.otpExpiresAt !== null &&
      user.otpExpiresAt.getTime() > Date.now() &&
      user.otpCode === dto.code;

    if (!isValid || !user) {
      throw new UnauthorizedException('Código inválido o expirado.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        otpVerifiedAt: new Date(),
        otpCode: null,
        otpExpiresAt: null,
      },
    });

    return { message: 'Email verificado correctamente.' };
  }

  // Token = base64url("<userId>:<secret>"). Codificar el userId en el propio token permite
  // buscar al usuario por su PK (indexada) en vez de escanear la tabla completa buscando un
  // resetPasswordTokenHash que coincida — importante en Turso, que cuenta filas escaneadas
  // contra la cuota del free tier (ver adr-sublistudio.md DEC-02). El secreto (la parte
  // impredecible) nunca se guarda tal cual — solo su hash, igual que una contraseña.
  private buildResetToken(userId: number): { token: string; hash: string } {
    const secret = randomBytes(32).toString('hex');
    const token = Buffer.from(`${userId}:${secret}`).toString('base64url');
    return { token, hash: this.hashResetSecret(secret) };
  }

  // El usuario final nunca ve el token pelado — hace clic en un link. Se arma sobre CORS_ORIGIN
  // (config `cors.origin`) en vez de agregar una variable "FRONTEND_URL" aparte: ese valor YA
  // es, por definición, el dominio del frontend (es lo que le decimos a CORS que confíe), así
  // que duplicarlo en dos variables que siempre tendrían que coincidir no suma nada.
  //
  // La ruta "/reset-password" es una convención asumida acá del lado del backend — hay que
  // confirmarla (o ajustarla) contra la ruta real que use sublistudio-frontend en Angular.
  private buildFrontendResetLink(token: string): string {
    const frontendOrigin = this.configService.get<string>('cors.origin');
    return `${frontendOrigin}/reset-password?token=${token}`;
  }

  private parseResetToken(
    token: string,
  ): { userId: number; secret: string } | null {
    try {
      const [userIdRaw, secret] = Buffer.from(token, 'base64url')
        .toString('utf8')
        .split(':');
      const userId = Number(userIdRaw);
      if (!Number.isInteger(userId) || !secret) {
        return null;
      }
      return { userId, secret };
    } catch {
      return null;
    }
  }

  private hashResetSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  // Compara en tiempo constante (evita que un atacante infiera el hash correcto byte a byte por
  // timing) y valida vigencia. `storedHash`/`storedExpiresAt` vienen tal cual de la fila del
  // usuario — null en cualquiera de los dos significa "no hay token pendiente".
  private isFreshToken(
    storedHash: string | null,
    storedExpiresAt: Date | null,
    candidateHash: string,
  ): boolean {
    if (!storedHash || !storedExpiresAt) {
      return false;
    }
    if (storedExpiresAt.getTime() <= Date.now()) {
      return false;
    }

    const storedBuffer = Buffer.from(storedHash, 'hex');
    const candidateBuffer = Buffer.from(candidateHash, 'hex');
    if (storedBuffer.length !== candidateBuffer.length) {
      return false;
    }
    return timingSafeEqual(storedBuffer, candidateBuffer);
  }

  async getSafeUserById(userId: number): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleSlug: user.role.slug,
    };
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    // El tipo de `expiresIn` en @nestjs/jwt es más estricto (number | StringValue, un tipo
    // interno de la librería "ms") que el `string` genérico que devuelve ConfigService — el cast
    // es seguro porque JWT_ACCESS_EXPIRATION/JWT_REFRESH_EXPIRATION siempre usan el formato
    // "<número><s|m|h|d>" que "ms" interpreta en runtime (ver .env.example).
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.accessExpiration',
        ) as unknown as number,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.refreshExpiration',
        ) as unknown as number,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
