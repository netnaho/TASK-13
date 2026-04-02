import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../app.module';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';

export interface TestContext {
  app: INestApplication;
  jwtService: JwtService;
  dataSource: DataSource;
}

export async function createTestApp(): Promise<TestContext> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();

  const jwtService = module.get(JwtService);
  const dataSource = module.get(DataSource);

  return { app, jwtService, dataSource };
}

export function makeToken(
  jwtService: JwtService,
  sub: string,
  role: string,
  username = 'testuser',
): string {
  return jwtService.sign({ sub, role, username });
}
