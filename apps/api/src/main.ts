// Sentry init MUST be the very first import — it patches http / fetch /
// pg / ioredis on require. Putting it after AppModule would mean those
// modules load unpatched and trace data silently goes missing. See
// instrument.ts for the full rationale.
import './instrument';

import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { SentryGlobalFilter } from './observability/sentry.filter';

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

  // Global Sentry exception filter — captures every unhandled exception
  // and forwards to Sentry (gated by killswitch.telemetry). Registered
  // last so it sits OUTSIDE per-controller filters.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter));

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
