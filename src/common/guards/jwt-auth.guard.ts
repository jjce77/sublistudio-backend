import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Valida el access token (Authorization: Bearer <token>). Ver JwtAccessStrategy.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-access') {}
