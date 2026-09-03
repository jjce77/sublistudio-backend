import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.type';
import { SafeUser } from '../auth.service';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // getOrThrow (no get): un secreto JWT ausente en runtime debe tumbar el arranque, no
      // degradar en silencio a `undefined` (que rompería la verificación de firma para todos).
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  // Passport llama a validate() solo si la firma/expiración del JWT ya son válidas. Se
  // re-consulta el usuario en BD (no se confía solo en el payload del token) para que un
  // bloqueo o borrado posterior a la emisión del token surta efecto de inmediato.
  async validate(payload: JwtPayload): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.deletedAt || user.isBlocked) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleSlug: user.role.slug,
    };
  }
}
