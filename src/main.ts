import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser()); // requerido para leer el refresh token desde cookie (DEC-03)

  // CORS obligatorio: frontend y backend viven en dominios distintos (DEC-03)
  app.enableCors({
    origin: config.get<string>('cors.origin'),
    credentials: true,
  });

  // Nunca confiar en datos crudos del cliente (Estandar_desarrollo_software.md §5.2): rechaza
  // cualquier campo no declarado en los DTOs y transforma tipos automáticamente.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Nunca exponer stack trace / detalles técnicos al cliente (Estandar_desarrollo_software.md
  // §5.1) — ver AllExceptionsFilter para el criterio de qué se enmascara y qué no.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger/OpenAPI — base para generar el cliente TypeScript del frontend Angular (DEC-03)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SubliStudio API')
    .setDescription('API de la plataforma de membresía SubliStudio')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Error fatal al iniciar la aplicación:', error);
  process.exit(1);
});
