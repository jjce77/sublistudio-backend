import { OAuthService } from './oauth.service';

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    service = new OAuthService();
  });

  it('lista solo los proveedores registrados en el arreglo del catálogo', () => {
    expect(service.listAvailableProviders()).toEqual(['google']);
  });

  it('confirma que un proveedor registrado existe', () => {
    expect(service.findProvider('google')).toBe(true);
  });

  it('devuelve false para un proveedor no registrado, aunque "suene" real', () => {
    expect(service.findProvider('facebook')).toBe(false);
  });
});
