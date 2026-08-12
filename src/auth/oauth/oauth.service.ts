import { Injectable } from '@nestjs/common';

// Catálogo de proveedores OAuth2 soportados por código — allowlist explícita, no descubrimiento
// automático (ver adr-sublistudio.md DEC-05, "Arquitectura de proveedores OAuth2"). Si existe
// un archivo <algo>.strategy.ts pero su nombre no está en el arreglo de abajo, ese proveedor es
// inalcanzable por la API: evita exponer accidentalmente un proveedor a medio construir.
//
// Responsabilidad única: "¿qué proveedores existen?". No sabe nada de Passport, de base de
// datos, ni de si un admin los habilitó — eso vive en OAuthProviderConfigService.
//
// Para agregar un proveedor nuevo: crear su <Nombre>Strategy (handshake + normalización en un
// solo lugar, como GoogleStrategy), inyectarla en AuthModule, y sumar su nombre aquí. Nada más
// de este archivo cambia.
@Injectable()
export class OAuthService {
  private readonly providers: string[] = ['google'];

  listAvailableProviders(): string[] {
    return [...this.providers];
  }

  findProvider(name: string): boolean {
    return this.providers.includes(name);
  }
}
