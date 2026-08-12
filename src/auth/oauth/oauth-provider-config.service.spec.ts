import { OAuthProviderConfigService } from './oauth-provider-config.service';

describe('OAuthProviderConfigService', () => {
  let globalVariables: { getJson: jest.Mock; setJson: jest.Mock };
  let service: OAuthProviderConfigService;

  beforeEach(() => {
    globalVariables = {
      getJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    service = new OAuthProviderConfigService(globalVariables as never);
  });

  describe('isEnabled', () => {
    it('devuelve true si el proveedor está en la lista habilitada', async () => {
      globalVariables.getJson.mockResolvedValue(['google']);

      expect(await service.isEnabled('google')).toBe(true);
    });

    it('devuelve false si la key todavía no existe (ningún proveedor habilitado)', async () => {
      globalVariables.getJson.mockResolvedValue(null);

      expect(await service.isEnabled('google')).toBe(false);
    });

    it('devuelve false si el proveedor existe en código pero no está en la lista', async () => {
      globalVariables.getJson.mockResolvedValue(['facebook']);

      expect(await service.isEnabled('google')).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('agrega el proveedor a la lista al habilitar', async () => {
      globalVariables.getJson.mockResolvedValue([]);

      await service.setEnabled('google', true, 7);

      expect(globalVariables.setJson).toHaveBeenCalledWith(
        'oauth_enabled_providers',
        ['google'],
        expect.any(Object) as unknown,
        7,
      );
    });

    it('quita el proveedor de la lista al deshabilitar, sin afectar a los demás', async () => {
      globalVariables.getJson.mockResolvedValue(['google', 'facebook']);

      await service.setEnabled('google', false, 7);

      expect(globalVariables.setJson).toHaveBeenCalledWith(
        'oauth_enabled_providers',
        ['facebook'],
        expect.any(Object) as unknown,
        7,
      );
    });

    it('no duplica un proveedor ya habilitado', async () => {
      globalVariables.getJson.mockResolvedValue(['google']);

      await service.setEnabled('google', true, 7);

      expect(globalVariables.setJson).toHaveBeenCalledWith(
        'oauth_enabled_providers',
        ['google'],
        expect.any(Object) as unknown,
        7,
      );
    });
  });
});
