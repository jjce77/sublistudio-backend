// Forma común a la que cada proveedor OAuth2 normaliza el perfil crudo que devuelve su propia
// API (que difiere entre Google, Facebook, etc.). AuthService.loginWithOAuth() solo conoce esta
// forma — nunca el payload específico de un proveedor. Ver adr-sublistudio.md DEC-05,
// "Arquitectura de proveedores OAuth2 (extensible)".
export interface OAuthProfile {
  provider: string; // "google" | "facebook" | ... — debe matchear OAuthProvider.name
  providerId: string; // ID único que entrega el proveedor (ej. Google "sub")
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}
