import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { ROLE_SLUGS } from '../common/constants/role.constant';

// Se instancia AuthService directamente (sin TestingModule de Nest) con mocks a mano: la clase
// no tiene lógica de framework propia más allá de la inyección por constructor, así que esto
// alcanza para probar el comportamiento real y corre más rápido.
describe('AuthService', () => {
  const CONFIG_VALUES: Record<string, string> = {
    'jwt.accessSecret': 'test-access-secret',
    'jwt.refreshSecret': 'test-refresh-secret',
    'jwt.accessExpiration': '15m',
    'jwt.refreshExpiration': '7d',
  };

  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    role: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let auditService: { record: jest.Mock };
  let authService: AuthService;
  let txUserCreate: jest.Mock;
  let txUserUpdate: jest.Mock;

  beforeEach(() => {
    txUserCreate = jest.fn();
    txUserUpdate = jest.fn();
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      role: { findUnique: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ user: { create: txUserCreate, update: txUserUpdate } }),
      ),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    configService = {
      get: jest.fn((key: string) => CONFIG_VALUES[key]),
      getOrThrow: jest.fn((key: string) => CONFIG_VALUES[key]),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    authService = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      auditService as never,
    );
  });

  describe('register', () => {
    const dto = {
      email: 'nueva@example.com',
      password: 'ClaveSegura123',
      firstName: 'Ana',
      lastName: 'García',
    };

    it('crea el usuario con el rol por defecto y audita la creación en la misma transacción', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({
        id: 4,
        slug: ROLE_SLUGS.USUARIO,
      });
      txUserCreate.mockResolvedValue({
        id: 1,
        email: dto.email,
        fullName: 'Ana García',
      });

      const result = await authService.register(dto);

      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { slug: ROLE_SLUGS.USUARIO },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'auth',
          action: 'CREATE',
          entityType: 'User',
        }),
        expect.anything(),
      );
      expect(result.user.roleSlug).toBe(ROLE_SLUGS.USUARIO);
      expect(result.tokens.accessToken).toBe('signed-token');
    });

    it('rechaza el registro si el email ya existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: dto.email });

      await expect(authService.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('falla si el rol por defecto no está sembrado en BD', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(authService.register(dto)).rejects.toThrow(/db:seed/);
    });
  });

  describe('login — DEC-05 (los 3 casos de fallo son indistinguibles)', () => {
    const dto = { email: 'usuario@example.com', password: 'ClaveSegura123' };

    it('rechaza con el mensaje genérico si el email no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza con el mensaje genérico si la cuenta es 100% OAuth (passwordHash NULL)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: dto.email,
        passwordHash: null,
        deletedAt: null,
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      await expect(authService.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza con el mensaje genérico si la contraseña es incorrecta', async () => {
      const realHash = await bcrypt.hash('OtraClaveDistinta1', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: dto.email,
        passwordHash: realHash,
        deletedAt: null,
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      await expect(authService.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('permite el login y emite tokens con credenciales correctas', async () => {
      const realHash = await bcrypt.hash(dto.password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: dto.email,
        fullName: 'Usuario Ejemplo',
        passwordHash: realHash,
        deletedAt: null,
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      const result = await authService.login(dto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(result.tokens.accessToken).toBe('signed-token');
      expect(result.user.roleSlug).toBe(ROLE_SLUGS.CLIENTE);
    });

    it('rechaza (403) una cuenta bloqueada aunque la contraseña sea correcta', async () => {
      const realHash = await bcrypt.hash(dto.password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: dto.email,
        passwordHash: realHash,
        deletedAt: null,
        isBlocked: true,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      await expect(authService.login(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('refresh', () => {
    it('emite tokens nuevos para un usuario válido', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      const tokens = await authService.refresh(1);

      expect(tokens.accessToken).toBe('signed-token');
    });

    it('rechaza si el usuario fue bloqueado después de emitido el refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        isBlocked: true,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      await expect(authService.refresh(1)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithOAuth', () => {
    const profile = {
      provider: 'google',
      providerId: 'google-sub-123',
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'García',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    it('reactiva (actualiza lastLoginAt) a un usuario ya vinculado a ese provider+providerId', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: profile.email,
        fullName: 'Ana García',
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });
      prisma.user.update.mockResolvedValue({
        id: 1,
        email: profile.email,
        fullName: 'Ana García',
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      const result = await authService.loginWithOAuth(profile);

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerId: {
              provider: 'google',
              providerId: 'google-sub-123',
            },
          },
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(result.tokens.accessToken).toBe('signed-token');
    });

    it('vincula el proveedor a una cuenta local existente con el mismo email (authMethod: both)', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // no existe por provider+providerId
        .mockResolvedValueOnce({
          id: 2,
          email: profile.email,
          passwordHash: 'hash-existente',
          avatarUrl: null,
          emailVerifiedAt: null,
        }); // sí existe por email (cuenta local)
      txUserUpdate.mockResolvedValue({
        id: 2,
        email: profile.email,
        fullName: 'Ana García',
        isBlocked: false,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      const result = await authService.loginWithOAuth(profile);

      expect(txUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: expect.objectContaining({ authMethod: 'both' }) as unknown,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'auth', action: 'UPDATE' }),
        expect.anything(),
      );
      expect(result.tokens.accessToken).toBe('signed-token');
    });

    it('crea una cuenta 100% OAuth nueva si no existe ni por provider+providerId ni por email', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.role.findUnique.mockResolvedValue({
        id: 4,
        slug: ROLE_SLUGS.USUARIO,
      });
      txUserCreate.mockResolvedValue({
        id: 3,
        email: profile.email,
        fullName: 'Ana García',
        isBlocked: false,
        role: { slug: ROLE_SLUGS.USUARIO },
      });

      const result = await authService.loginWithOAuth(profile);

      expect(txUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: null,
            authMethod: 'google',
            provider: 'google',
            providerId: 'google-sub-123',
          }) as unknown,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'auth', action: 'CREATE' }),
        expect.anything(),
      );
      expect(result.user.roleSlug).toBe(ROLE_SLUGS.USUARIO);
    });

    it('rechaza (403) una cuenta bloqueada aunque el proveedor OAuth ya esté vinculado', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 1,
        email: profile.email,
        isBlocked: true,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });
      prisma.user.update.mockResolvedValue({
        id: 1,
        email: profile.email,
        isBlocked: true,
        role: { slug: ROLE_SLUGS.CLIENTE },
      });

      await expect(authService.loginWithOAuth(profile)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
