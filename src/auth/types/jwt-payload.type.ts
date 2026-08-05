// Payload firmado en ambos tokens (access y refresh) — mínimo necesario para no acoplar el
// contenido del JWT a todos los campos de User. El rol se re-verifica contra BD en cada request
// (JwtAccessStrategy), así que roleSlug aquí es solo un hint, nunca la fuente de verdad de RBAC.
export interface JwtPayload {
  sub: number;
  roleSlug: string;
}
