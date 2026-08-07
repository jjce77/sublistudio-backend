import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleSlug } from '../constants/role.constant';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SafeUser } from '../../auth/auth.service';

// RBAC explícito por endpoint (Estandar_desarrollo_software.md §5.2): se coloca DESPUÉS de
// JwtAuthGuard en @UseGuards (el orden importa — este guard necesita req.user ya resuelto).
// Sin @Roles() en el handler/controlador, deja pasar a cualquier usuario autenticado.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      RoleSlug[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: SafeUser }>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.roleSlug as RoleSlug)) {
      throw new ForbiddenException('No tienes permisos para esta acción.');
    }

    return true;
  }
}
