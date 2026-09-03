import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { type SafeUser } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;
type UserWithRoleAndSubscriptions = Prisma.UserGetPayload<{
  include: { role: true; subscriptions: { include: { plan: true } } };
}>;

// Genera una contraseña temporal que SIEMPRE cumple la misma política que RegisterDto
// (letra + dígito, 8-72 caracteres) — a diferencia de un base64 al azar, que podría no traer
// dígitos por pura probabilidad. Se arma en dos mitades explícitas para garantizarlo, no para
// confiar en la suerte.
function generateTemporaryPassword(): string {
  const letters = randomBytes(8)
    .toString('base64url')
    .replace(/[^a-zA-Z]/g, '')
    .padEnd(8, 'x')
    .slice(0, 8);
  const digits = Array.from({ length: 4 }, () => randomInt(0, 10)).join('');
  return `${letters}${digits}`;
}

export interface UserListFilters {
  roleSlug?: string;
  isBlocked?: boolean;
}

// CRUD de usuarios + acciones de administración de cuenta para el panel admin (TASKS.md Fase
// 2). Sigue el mismo patrón que GlobalVariablesService: toda escritura pasa por
// `prisma.$transaction` con su `auditService.record()` adentro (CLAUDE.md, atomicidad).
//
// Reglas de privilegio (no están en TASKS.md explícitamente pero se derivan de la nota de
// schema "Superadmin no eliminable", Fase 1): un Administrador puede gestionar Cliente/Usuario/
// otro Administrador, pero NUNCA una cuenta Superadmin — eso requiere ser Superadmin. Tampoco
// se puede bloquear/eliminar la propia cuenta (evita que un admin se deje afuera del sistema
// por accidente).
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  async list(filters: UserListFilters) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(filters.roleSlug ? { role: { slug: filters.roleSlug } } : {}),
        ...(filters.isBlocked !== undefined
          ? { isBlocked: filters.isBlocked }
          : {}),
      },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toUserListItem(user));
  }

  async findOneOrThrow(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: true,
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`No existe el usuario ${id}.`);
    }
    return this.toUserDetail(user);
  }

  async create(dto: CreateUserDto, actor: SafeUser) {
    this.assertCanManageRole(actor, dto.roleSlug);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con ese email.',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { slug: dto.roleSlug },
    });
    if (!role) {
      throw new NotFoundException(
        `El rol "${dto.roleSlug}" no existe en la base de datos. Corre "npm run db:seed".`,
      );
    }

    const generatedPassword = dto.password ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          authMethod: 'local',
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          roleId: role.id,
        },
      });

      await this.auditService.record(
        {
          module: 'users',
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          userId: actor.id,
          payload: {
            email: dto.email,
            roleSlug: dto.roleSlug,
            createdByAdmin: true,
            passwordProvidedByAdmin: Boolean(dto.password),
          },
        },
        tx,
      );

      return user;
    });

    // Fuera de la transacción de BD a propósito (mismo criterio que AuthService.forgotPassword):
    // un fallo de correo no debe revertir la creación del usuario, que ya quedó persistida y
    // auditada.
    await this.mailerService.sendMail({
      to: created.email,
      subject: 'Tu cuenta en Sublistudio',
      text:
        `Hola ${dto.firstName},\n\n` +
        `Se creó una cuenta para vos en Sublistudio.\n` +
        `Email: ${created.email}\n` +
        `Contraseña temporal: ${generatedPassword}\n\n` +
        `Te recomendamos cambiarla después de iniciar sesión.`,
    });

    return this.findOneOrThrow(created.id);
  }

  async update(id: number, dto: UpdateUserDto, actor: SafeUser) {
    const target = await this.getActiveUserOrThrow(id);
    this.assertCanManageRole(actor, target.role.slug);
    if (dto.roleSlug) {
      this.assertCanManageRole(actor, dto.roleSlug);
    }

    if (dto.email && dto.email !== target.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'Ya existe una cuenta registrada con ese email.',
        );
      }
    }

    let roleId: number | undefined;
    if (dto.roleSlug) {
      const role = await this.prisma.role.findUnique({
        where: { slug: dto.roleSlug },
      });
      if (!role) {
        throw new NotFoundException(`El rol "${dto.roleSlug}" no existe.`);
      }
      roleId = role.id;
    }

    const willChangeName =
      dto.firstName !== undefined || dto.lastName !== undefined;
    const fullName = willChangeName
      ? `${dto.firstName ?? target.firstName} ${dto.lastName ?? target.lastName}`.trim()
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          telegram: dto.telegram,
          country: dto.country,
          city: dto.city,
          address: dto.address,
          roleId,
        },
      });

      await this.auditService.record(
        {
          module: 'users',
          action: 'UPDATE',
          entityType: 'User',
          entityId: id,
          userId: actor.id,
          payload: { changes: dto },
        },
        tx,
      );
    });

    return this.findOneOrThrow(id);
  }

  async block(id: number, actor: SafeUser) {
    const target = await this.getActiveUserOrThrow(id);
    this.assertCanManageRole(actor, target.role.slug);
    if (target.id === actor.id) {
      throw new ForbiddenException('No podés bloquear tu propia cuenta.');
    }
    if (target.isBlocked) {
      return this.findOneOrThrow(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isBlocked: true } });
      await this.auditService.record(
        {
          module: 'users',
          action: 'BLOCK',
          entityType: 'User',
          entityId: id,
          userId: actor.id,
        },
        tx,
      );
    });

    return this.findOneOrThrow(id);
  }

  async unblock(id: number, actor: SafeUser) {
    const target = await this.getActiveUserOrThrow(id);
    this.assertCanManageRole(actor, target.role.slug);
    if (!target.isBlocked) {
      return this.findOneOrThrow(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isBlocked: false } });
      await this.auditService.record(
        {
          module: 'users',
          action: 'UNBLOCK',
          entityType: 'User',
          entityId: id,
          userId: actor.id,
        },
        tx,
      );
    });

    return this.findOneOrThrow(id);
  }

  // Baja definitiva (soft delete) — nunca borra la fila física (DEC-06). Bloquea explícitamente
  // borrar una cuenta Superadmin (nota de schema, Fase 1: "Superadmin no eliminable" no está
  // forzado a nivel de BD porque SQLite no soporta índice único parcial vía Prisma) y borrarse
  // a uno mismo.
  async softDelete(id: number, actor: SafeUser): Promise<void> {
    const target = await this.getActiveUserOrThrow(id);

    if (target.role.slug === ROLE_SLUGS.SUPERADMIN) {
      throw new ForbiddenException(
        'No se puede eliminar una cuenta Superadmin.',
      );
    }
    if (target.id === actor.id) {
      throw new ForbiddenException('No podés eliminar tu propia cuenta.');
    }
    this.assertCanManageRole(actor, target.role.slug);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.auditService.record(
        {
          module: 'users',
          action: 'DELETE',
          entityType: 'User',
          entityId: id,
          userId: actor.id,
        },
        tx,
      );
    });
  }

  // "Log por cuenta" (TASKS.md Fase 2) — reutiliza AuditLog en vez de una tabla nueva: cada
  // acción sobre el usuario (CREATE/UPDATE/BLOCK/UNBLOCK/DELETE, y las que dispare AuthService
  // como login/OAuth) ya queda ahí por `entityType: 'User', entityId: id`.
  async getAuditLogs(id: number) {
    await this.getActiveUserOrThrow(id);
    return this.prisma.auditLog.findMany({
      where: { entityType: 'User', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSubscriptions(userId: number) {
    await this.getActiveUserOrThrow(userId);
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // "Estados: activa, cancelada, vencida" (TASKS.md Fase 2). Cambio manual desde el panel admin
  // — el ciclo automático (vencimiento por fecha, cancelación desde la pasarela) es de Fase 8.
  async updateSubscriptionStatus(
    userId: number,
    subscriptionId: number,
    dto: UpdateSubscriptionStatusDto,
    actor: SafeUser,
  ) {
    await this.getActiveUserOrThrow(userId);

    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!subscription) {
      throw new NotFoundException(
        `No existe la suscripción ${subscriptionId} para el usuario ${userId}.`,
      );
    }

    const data: Prisma.SubscriptionUpdateInput = { status: dto.status };
    if (dto.status === 'CANCELADA' && subscription.status !== 'CANCELADA') {
      data.cancelledAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data,
      });

      await this.auditService.record(
        {
          module: 'users',
          action: 'UPDATE',
          entityType: 'Subscription',
          entityId: subscriptionId,
          userId: actor.id,
          payload: { from: subscription.status, to: dto.status },
        },
        tx,
      );

      return updated;
    });
  }

  // Automatización "tras pago validado, generar usuario + contraseña únicos, enviar por
  // correo" (TASKS.md Fase 2). No hay pasarela de pagos todavía (Fase 8) que la dispare sola —
  // esta pieza queda lista y probada para que el webhook de pago la llame directo
  // (inyectando UsersService) en cuanto exista. `actor` es opcional porque, cuando la llame un
  // webhook real, no habrá un admin autenticado detrás — solo el sistema.
  async provisionFromPayment(dto: ProvisionUserDto, actor?: SafeUser) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con ese email — no se puede re-provisionar.',
      );
    }

    const plan = await this.prisma.plan.findFirst({
      where: { id: dto.planId, deletedAt: null },
    });
    if (!plan) {
      throw new NotFoundException(
        `No existe el plan ${dto.planId} o está inactivo.`,
      );
    }

    const clienteRole = await this.prisma.role.findUnique({
      where: { slug: ROLE_SLUGS.CLIENTE },
    });
    if (!clienteRole) {
      throw new Error(
        `Rol "${ROLE_SLUGS.CLIENTE}" no existe en la base de datos. Corre "npm run db:seed".`,
      );
    }

    const generatedPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          authMethod: 'local',
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          roleId: clienteRole.id,
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'ACTIVA',
          paymentGatewayRef: dto.paymentGatewayRef,
        },
      });

      await this.auditService.record(
        {
          module: 'users',
          action: 'CREATE',
          entityType: 'User',
          entityId: user.id,
          userId: actor?.id,
          payload: {
            email: dto.email,
            provisionedFromPayment: true,
            planId: plan.id,
          },
        },
        tx,
      );

      await this.auditService.record(
        {
          module: 'users',
          action: 'CREATE',
          entityType: 'Subscription',
          entityId: subscription.id,
          userId: actor?.id,
          payload: {
            userId: user.id,
            planId: plan.id,
            paymentGatewayRef: dto.paymentGatewayRef ?? null,
          },
        },
        tx,
      );

      return user;
    });

    await this.mailerService.sendMail({
      to: created.email,
      subject: 'Bienvenido a Sublistudio — tu cuenta está lista',
      text:
        `Hola ${dto.firstName},\n\n` +
        `Tu pago fue confirmado y tu cuenta ya está activa.\n` +
        `Email: ${created.email}\n` +
        `Contraseña temporal: ${generatedPassword}\n\n` +
        `Te recomendamos cambiarla después de iniciar sesión.`,
    });

    return this.findOneOrThrow(created.id);
  }

  private async getActiveUserOrThrow(id: number): Promise<UserWithRole> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException(`No existe el usuario ${id}.`);
    }
    return user;
  }

  // Un Administrador puede gestionar cualquier rol excepto Superadmin — esa cuenta solo la
  // toca otro Superadmin. Se llama tanto con el rol actual del usuario objetivo (¿el actor
  // puede tocar ESTA cuenta?) como con el rol destino en create/update de rol (¿el actor puede
  // ASIGNAR este rol?).
  private assertCanManageRole(actor: SafeUser, targetRoleSlug: string): void {
    if (
      targetRoleSlug === ROLE_SLUGS.SUPERADMIN &&
      actor.roleSlug !== ROLE_SLUGS.SUPERADMIN
    ) {
      throw new ForbiddenException(
        'Solo un Superadmin puede gestionar cuentas Superadmin.',
      );
    }
  }

  // Allowlist explícito (no blocklist) de campos expuestos — así un campo sensible nuevo que se
  // agregue al schema en el futuro (ej. un token) no se filtra por accidente si alguien olvida
  // actualizar este mapper.
  private toUserListItem(user: UserWithRole) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      roleSlug: user.role.slug,
      isBlocked: user.isBlocked,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toUserDetail(user: UserWithRoleAndSubscriptions) {
    return {
      ...this.toUserListItem(user),
      authMethod: user.authMethod,
      provider: user.provider,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      whatsapp: user.whatsapp,
      telegram: user.telegram,
      country: user.country,
      city: user.city,
      address: user.address,
      subscriptions: user.subscriptions.map((subscription) => ({
        id: subscription.id,
        planId: subscription.planId,
        planName: subscription.plan.name,
        status: subscription.status,
        startedAt: subscription.startedAt,
        renewsAt: subscription.renewsAt,
        cancelledAt: subscription.cancelledAt,
        paymentGatewayRef: subscription.paymentGatewayRef,
      })),
    };
  }
}
