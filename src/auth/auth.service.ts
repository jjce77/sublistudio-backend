import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OAuthProfile } from './oauth/oauth-profile.type';
import { JwtPayload } from './types/jwt-payload.type';

// Hash bcrypt "señuelo" (de una contraseña aleatoria descartada, no de una cuenta real) contra
// el que se compara cuando no hay contraseña real disponible (email inexistente o cuenta 100%
// OAuth). Sin esto, `bcrypt.compare` se saltaría y la respuesta sería más rápida en esos casos,
// delatando por timing lo que el mensaje genérico ya intenta ocultar (DEC-05).
const DUMMY_PASSWORD_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Yv0lqzz6b5PZ2mSAvdxeqYzR6qYb2';

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
