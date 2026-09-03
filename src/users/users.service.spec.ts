import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROLE_SLUGS } from '../common/constants/role.constant';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    plan: { findFirst: jest.Mock };
    subscription: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let mailerService: { sendMail: jest.Mock };
  let service: UsersService;

  const superadminActor = {
    id: 1,
    email: 'root@example.com',
    fullName: 'Root',
    roleSlug: ROLE_SLUGS.SUPERADMIN,
  };
  const adminActor = {
    id: 2,
    email: 'admin@example.com',
    fullName: 'Admin',
    roleSlug: ROLE_SLUGS.ADMINISTRADOR,
  };

  const roleUsuario = { id: 10, slug: ROLE_SLUGS.USUARIO };
  const roleSuperadmin = { id: 11, slug: ROLE_SLUGS.SUPERADMIN };
  const roleCliente = { id: 12, slug: ROLE_SLUGS.CLIENTE };

  function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 100,
      email: 'usuario@example.com',
      firstName: 'Ana',
      lastName: 'García',
      fullName: 'Ana García',
      authMethod: 'local',
      provider: null,
      avatarUrl: null,
      phone: null,
      whatsapp: null,
      telegram: null,
      country: null,
      city: null,
      address: null,
      isBlocked: false,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      role: roleUsuario,
      subscriptions: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      plan: { findFirst: jest.fn() },
      subscription: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { findMany: jest.fn() },
      // Mismo patrón que global-variables.service.spec.ts: $transaction corre el callback con
      // el propio mock de prisma como "tx".
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      prisma as never,
      auditService as never,
      mailerService as never,
    );
  });

  describe('create', () => {
    it('crea el usuario, audita, y manda el correo con la contraseña generada cuando no se pasa una', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null); // email libre
      prisma.role.findUnique.mockResolvedValue(roleUsuario);
      prisma.user.create.mockResolvedValue(buildUser());
      prisma.user.findFirst.mockResolvedValue(buildUser()); // findOneOrThrow al final

      await service.create(
        {
          email: 'usuario@example.com',
          firstName: 'Ana',
          lastName: 'García',
          roleSlug: ROLE_SLUGS.USUARIO,
        },
        adminActor,
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'users',
          action: 'CREATE',
          entityType: 'User',
        }),
        prisma,
      );
      expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
      const mail = mailerService.sendMail.mock.calls[0][0];
      expect(mail.to).toBe('usuario@example.com');
      expect(mail.text).toMatch(/Contraseña temporal:/);
    });

    it('lanza ConflictException si el email ya existe', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(buildUser());

      await expect(
        service.create(
          {
            email: 'usuario@example.com',
            firstName: 'Ana',
            lastName: 'García',
            roleSlug: ROLE_SLUGS.USUARIO,
          },
          adminActor as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('un Administrador no puede crear una cuenta Superadmin', async () => {
      await expect(
        service.create(
          {
            email: 'nuevo@example.com',
            firstName: 'A',
            lastName: 'B',
            roleSlug: ROLE_SLUGS.SUPERADMIN,
          },
          adminActor as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('un Superadmin sí puede crear otra cuenta Superadmin', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.role.findUnique.mockResolvedValue(roleSuperadmin);
      prisma.user.create.mockResolvedValue(buildUser({ role: roleSuperadmin }));
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ role: roleSuperadmin }),
      );

      await expect(
        service.create(
          {
            email: 'nuevo@example.com',
            firstName: 'A',
            lastName: 'B',
            roleSlug: ROLE_SLUGS.SUPERADMIN,
          },
          superadminActor as never,
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('block / unblock', () => {
    it('bloquea la cuenta y audita BLOCK', async () => {
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ id: 100, isBlocked: false }),
      );
      prisma.user.update.mockResolvedValue(undefined);

      await service.block(100, adminActor);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { isBlocked: true },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BLOCK',
          entityType: 'User',
          entityId: 100,
        }),
        prisma,
      );
    });

    it('no permite que un admin se bloquee a sí mismo', async () => {
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ id: adminActor.id, isBlocked: false }),
      );

      await expect(
        service.block(adminActor.id, adminActor as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('un Administrador no puede bloquear una cuenta Superadmin', async () => {
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ id: 999, role: roleSuperadmin }),
      );

      await expect(
        service.block(999, adminActor as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('lanza ForbiddenException al intentar eliminar una cuenta Superadmin', async () => {
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ id: 999, role: roleSuperadmin }),
      );

      await expect(
        service.softDelete(999, adminActor as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lanza ForbiddenException si el admin intenta eliminarse a sí mismo', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser({ id: adminActor.id }));

      await expect(
        service.softDelete(adminActor.id, adminActor as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marca deletedAt y audita DELETE para una cuenta normal', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser({ id: 100 }));
      prisma.user.update.mockResolvedValue(undefined);

      await service.softDelete(100, adminActor);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { deletedAt: expect.any(Date) },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'User',
          entityId: 100,
        }),
        prisma,
      );
    });

    it('lanza NotFoundException si el usuario no existe (o ya está borrado)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.softDelete(9999, adminActor as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('setea cancelledAt cuando el nuevo status es CANCELADA', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser({ id: 100 }));
      prisma.subscription.findFirst.mockResolvedValue({
        id: 50,
        userId: 100,
        status: 'ACTIVA',
      });
      prisma.subscription.update.mockResolvedValue({
        id: 50,
        status: 'CANCELADA',
      });

      await service.updateSubscriptionStatus(
        100,
        50,
        { status: 'CANCELADA' },
        adminActor,
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { status: 'CANCELADA', cancelledAt: expect.any(Date) },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entityType: 'Subscription',
          entityId: 50,
          payload: { from: 'ACTIVA', to: 'CANCELADA' },
        }),
        prisma,
      );
    });

    it('lanza NotFoundException si la suscripción no pertenece al usuario', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser({ id: 100 }));
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSubscriptionStatus(
          100,
          999,
          { status: 'VENCIDA' },
          adminActor as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('provisionFromPayment', () => {
    it('crea usuario + suscripción ACTIVA en la misma transacción y envía el correo de bienvenida', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 5, name: 'Plan Pro' });
      prisma.role.findUnique.mockResolvedValue(roleCliente);
      prisma.user.create.mockResolvedValue(
        buildUser({ id: 200, email: 'cliente@example.com', role: roleCliente }),
      );
      prisma.subscription.create.mockResolvedValue({
        id: 60,
        userId: 200,
        planId: 5,
        status: 'ACTIVA',
      });
      prisma.user.findFirst.mockResolvedValue(
        buildUser({ id: 200, email: 'cliente@example.com', role: roleCliente }),
      );

      await service.provisionFromPayment(
        {
          email: 'cliente@example.com',
          firstName: 'Cliente',
          lastName: 'Nuevo',
          planId: 5,
        },
        adminActor,
      );

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: {
          userId: 200,
          planId: 5,
          status: 'ACTIVA',
          paymentGatewayRef: undefined,
        },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'Subscription',
        }),
        prisma,
      );
      expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
      expect(mailerService.sendMail.mock.calls[0][0].to).toBe(
        'cliente@example.com',
      );
    });

    it('lanza ConflictException si el email ya tiene cuenta', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(buildUser());

      await expect(
        service.provisionFromPayment(
          {
            email: 'usuario@example.com',
            firstName: 'A',
            lastName: 'B',
            planId: 5,
          },
          adminActor as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza NotFoundException si el plan no existe o está inactivo', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.provisionFromPayment(
          {
            email: 'nuevo@example.com',
            firstName: 'A',
            lastName: 'B',
            planId: 999,
          },
          adminActor as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAuditLogs', () => {
    it('consulta AuditLog filtrando por entityType=User y el id del usuario', async () => {
      prisma.user.findFirst.mockResolvedValue(buildUser({ id: 100 }));
      prisma.auditLog.findMany.mockResolvedValue([{ id: 1, action: 'CREATE' }]);

      const result = await service.getAuditLogs(100);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: 'User', entityId: 100 },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });
});
