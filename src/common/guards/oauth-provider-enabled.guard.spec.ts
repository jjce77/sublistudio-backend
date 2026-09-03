import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OAuthProviderEnabledGuard } from './oauth-provider-enabled.guard';

describe('OAuthProviderEnabledGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let oauthService: { findProvider: jest.Mock };
  let oauthProviderConfig: { isEnabled: jest.Mock };
  let guard: OAuthProviderEnabledGuard;

  const buildContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    oauthService = { findProvider: jest.fn() };
    oauthProviderConfig = { isEnabled: jest.fn() };
    guard = new OAuthProviderEnabledGuard(
      reflector as unknown as Reflector,
      oauthService as never,
      oauthProviderConfig as never,
    );
  });

  it('permite pasar cuando el proveedor existe en el catálogo y está habilitado', async () => {
    reflector.getAllAndOverride.mockReturnValue('google');
    oauthService.findProvider.mockReturnValue({ name: 'google' });
    oauthProviderConfig.isEnabled.mockResolvedValue(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('responde 404 si el proveedor no existe en el catálogo de código', async () => {
    reflector.getAllAndOverride.mockReturnValue('facebook');
    oauthService.findProvider.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      NotFoundException,
    );
    expect(oauthProviderConfig.isEnabled).not.toHaveBeenCalled();
  });

  it('responde 404 si el proveedor existe pero un admin no lo habilitó', async () => {
    reflector.getAllAndOverride.mockReturnValue('google');
    oauthService.findProvider.mockReturnValue({ name: 'google' });
    oauthProviderConfig.isEnabled.mockResolvedValue(false);

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza un error de programación si falta @OAuthProviderName() en el handler', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      /@OAuthProviderName/,
    );
  });
});
