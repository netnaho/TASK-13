import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { createWinstonLogger } from './common/logger/winston.logger';

async function bootstrap(): Promise<void> {
  const logger = createWinstonLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

  // Block unauthenticated static access to voice recordings.
  // Authenticated access is served via GET /api/conversations/voice/:fileName.
  app.use('/uploads/voice', (_req: unknown, res: any) => {
    res.status(401).json({ code: 401, msg: 'Unauthorized', timestamp: new Date().toISOString() });
  });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  logger.log(`Backend running on port ${port}`, 'Bootstrap');
}

bootstrap();
