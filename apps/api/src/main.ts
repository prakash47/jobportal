import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const allowedOrigins = [
    process.env.WEB_URL ?? 'http://localhost:3000',
    process.env.RECRUITER_URL ?? 'http://localhost:3001',
    process.env.SERVICES_URL ?? 'http://localhost:3002',
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
