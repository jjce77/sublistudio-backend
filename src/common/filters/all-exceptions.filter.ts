import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Response } from 'express';

// Regla no negociable (Estandar_desarrollo_software.md §5.1 y CLAUDE.md): ningún endpoint
// devuelve mensaje de excepción crudo, stack trace, ni nombre de tabla/columna real al
// frontend. Las HttpException con status < 500 son mensajes de negocio deliberados (DTO
// inválido, credenciales incorrectas, permisos) — se devuelven tal cual porque ya están
// pensadas para el usuario final. Cualquier otro error (500, excepción no controlada de
// Prisma/librerías) se enmascara con un mensaje genérico + traceId; el detalle completo solo
// va al log interno, correlacionado por ese mismo traceId.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const isSafeToExposeToClient =
      isHttpException && status < Number(HttpStatus.INTERNAL_SERVER_ERROR);

    this.logger.error(
      `traceId=${traceId} status=${status} ${
        exception instanceof Error ? exception.stack : JSON.stringify(exception)
      }`,
    );

    if (isSafeToExposeToClient) {
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'object'
            ? { ...body, traceId }
            : { message: body, traceId },
        );
      return;
    }

    response.status(status).json({
      statusCode: status,
      message:
        'Ha ocurrido un error inesperado. Contacta a soporte con este identificador.',
      traceId,
    });
  }
}
