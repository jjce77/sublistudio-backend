import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Valida el refresh token, leído desde la cookie httpOnly (ver JwtRefreshStrategy) — nunca
// desde el header Authorization.
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
