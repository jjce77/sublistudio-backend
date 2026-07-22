import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // CORS obligatorio: frontend y backend viven en dominios distintos (DEC-03)
  app.enableCors({
    origin: config.get<string>('cors.origin'),
    credentials: true,
  });

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
bootstrap();
