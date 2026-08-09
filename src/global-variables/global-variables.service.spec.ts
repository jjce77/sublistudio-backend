import { NotFoundException } from '@nestjs/common';
import { GlobalVariablesService } from './global-variables.service';
import { GlobalVariableValueType } from './types/global-variable-value-type.enum';

describe('GlobalVariablesService', () => {
  let prisma: {
    globalVariable: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let service: GlobalVariablesService;

  beforeEach(() => {
    prisma = {
      globalVariable: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      // Simula $transaction ejecutando el callback con el mismo mock de prisma como "tx" —
      // suficiente para probar el comportamiento sin una BD real (mismo patrón que
      // auth.service.spec.ts).
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new GlobalVariablesService(
      prisma as never,
      auditService as never,
    );
  });

  describe('getScalar', () => {
    it('devuelve el valor desenvuelto cuando la key existe y es SCALAR', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue({
        valueType: GlobalVariableValueType.SCALAR,
        value: { value: 50 },
      });

      const result = await service.getScalar<number>('max_upload_size_mb');

      expect(result).toBe(50);
    });

    it('devuelve null si la key no existe', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue(null);

      const result = await service.getScalar('no_existe');

      expect(result).toBeNull();
    });

    it('devuelve null si la key existe pero es JSON, no SCALAR', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue({
        valueType: GlobalVariableValueType.JSON,
        value: ['google'],
      });

      const result = await service.getScalar('oauth_enabled_providers');

      expect(result).toBeNull();
    });
  });

  describe('getJson', () => {
    it('devuelve el valor JSON sin envolver', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue({
        valueType: GlobalVariableValueType.JSON,
        value: ['google'],
      });

      const result = await service.getJson<string[]>('oauth_enabled_providers');

      expect(result).toEqual(['google']);
    });
  });

  describe('setScalar / setJson (upsert)', () => {
    it('crea la variable y audita CREATE cuando la key no existía', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue(null);
      prisma.globalVariable.create.mockResolvedValue({
        id: 1,
        key: 'max_upload_size_mb',
      });

      await service.setScalar('max_upload_size_mb', 50, {}, 7);

      expect(prisma.globalVariable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: 'max_upload_size_mb',
            valueType: GlobalVariableValueType.SCALAR,
            value: { value: 50 },
          }) as unknown,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'global_variables',
          action: 'CREATE',
          userId: 7,
        }),
        prisma,
      );
    });

    it('actualiza la variable y audita UPDATE cuando la key ya existía', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue({
        id: 3,
        key: 'oauth_enabled_providers',
      });
      prisma.globalVariable.update.mockResolvedValue({
        id: 3,
        key: 'oauth_enabled_providers',
      });

      await service.setJson('oauth_enabled_providers', ['google'], {}, 7);

      expect(prisma.globalVariable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: expect.objectContaining({
            valueType: GlobalVariableValueType.JSON,
            value: ['google'],
          }) as unknown,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'global_variables',
          action: 'UPDATE',
          userId: 7,
        }),
        prisma,
      );
    });
  });

  describe('findOneOrThrow', () => {
    it('lanza NotFoundException si la key no existe', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue(null);

      await expect(service.findOneOrThrow('no_existe')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDelete', () => {
    it('marca deletedAt y audita DELETE', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue({
        id: 5,
        key: 'oauth_enabled_providers',
      });
      prisma.globalVariable.update.mockResolvedValue({});

      await service.softDelete('oauth_enabled_providers', 7);

      expect(prisma.globalVariable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: expect.objectContaining({
            deletedAt: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'global_variables',
          action: 'DELETE',
          userId: 7,
        }),
        prisma,
      );
    });

    it('lanza NotFoundException si la key ya no existe', async () => {
      prisma.globalVariable.findFirst.mockResolvedValue(null);

      await expect(service.softDelete('no_existe', 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listAll', () => {
    it('excluye borradas y ordena por key', async () => {
      prisma.globalVariable.findMany.mockResolvedValue([]);

      await service.listAll();

      expect(prisma.globalVariable.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { key: 'asc' },
      });
    });
  });
});
