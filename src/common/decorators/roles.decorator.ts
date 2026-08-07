import { SetMetadata } from '@nestjs/common';
import { RoleSlug } from '../constants/role.constant';

export const ROLES_KEY = 'roles';

// Uso: @Roles(ROLE_SLUGS.ADMINISTRADOR, ROLE_SLUGS.SUPERADMIN) sobre un controlador o handler,
// combinado con RolesGuard (que además requiere JwtAuthGuard antes, para tener req.user).
export const Roles = (...roles: RoleSlug[]) => SetMetadata(ROLES_KEY, roles);
