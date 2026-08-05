// Los 4 roles fijos del negocio (ver prisma/schema.prisma, model Role). Se mantienen como
// constantes de código porque los valores reales viven en la tabla `roles` (seed en
// prisma/seed.ts) — esto es solo para no repetir los strings literales por todo el código.
export const ROLE_SLUGS = {
  SUPERADMIN: 'SUPERADMIN',
  ADMINISTRADOR: 'ADMINISTRADOR',
  CLIENTE: 'CLIENTE',
  USUARIO: 'USUARIO',
} as const;

export type RoleSlug = (typeof ROLE_SLUGS)[keyof typeof ROLE_SLUGS];
