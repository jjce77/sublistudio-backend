import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SafeUser } from '../../auth/auth.service';

// Extrae el usuario que JwtAuthGuard ya dejó en req.user (ver JwtAccessStrategy.validate).
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SafeUser => {
    const request = ctx.switchToHttp().getRequest<{ user: SafeUser }>();
    return request.user;
  },
);
