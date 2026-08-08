// Sentry init MUST be the very first import — it patches http / fetch /
// pg / ioredis on require. Putting it after AppModule would mean those
// modules load unpatched and trace data silently goes missing. See
// instrument.ts for the full rationale.
import './instrument';

import 'reflect-metadata';
import { VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
// Typed as the Express application specifically, so `app.set('trust proxy', …)`
// is a checked call rather than a cast. This only NAMES the platform Nest was
// already using — cookie-parser below is Express middleware, and platform-express
// is Nest's default. (`rawBody` is not evidence either way; Fastify supports it
// too.)
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { parseTrustProxy, trustProxyWarning } from './common/trust-proxy';
import { SentryGlobalFilter } from './observability/sentry.filter';

async function bootstrap(): Promise<void> {
  // rawBody: Razorpay webhook signatures are HMACs over the exact bytes sent;
  // the parsed-then-restringified JSON never matches. Nest keeps req.rawBody
  // alongside the parsed body only when asked at boot (used solely by
  // recruiter-billing's webhook controller).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  app.use(cookieParser());

  // How far to trust X-Forwarded-For when deriving req.ip. Everything that
  // identifies a caller depends on this: the global 100/min ThrottlerGuard, the
  // per-IP login throttle, and the Session/OtpChallenge ipAddress columns.
  // Defaults to Express's `false`, i.e. exactly today's behaviour, so local
  // development is unchanged and no environment silently gains a spoofable
  // limiter. See common/trust-proxy.ts for why this is configuration and not a
  // constant.
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  app.set('trust proxy', trustProxy);
  const proxyWarning = trustProxyWarning(trustProxy, process.env.NODE_ENV);
  if (proxyWarning) console.warn(`[trust-proxy] ${proxyWarning}`);

  // URI versioning for the public/mobile surface (ADR 0002 decision 2).
  //
  // defaultVersion: VERSION_NEUTRAL is load-bearing — it means every EXISTING
  // controller keeps its exact current path (`/auth/login`, `/me/saved-jobs`,
  // `/recruiter/jobs`, …). Only a controller that opts in with
  // `@Controller({ path: 'x', version: '1' })` moves to `/v1/x`. A plain
  // setGlobalPrefix('v1') would have relocated all 36 controllers and broken
  // apps/web, apps/recruiter and apps/sadmin in one commit.
  //
  // Why version at all, when the websites never needed it: an installed mobile
  // binary cannot be rolled forward. A field rename that is a one-line fix on
  // the web permanently breaks every phone that has not updated, and a version
  // prefix cannot be retrofitted after v1.0 ships without breaking those same
  // users. It costs nothing today and is unbuyable later.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });

  const allowedOrigins = [
    process.env.WEB_URL ?? 'http://localhost:3000',
    process.env.RECRUITER_URL ?? 'http://localhost:3001',
    process.env.SERVICES_URL ?? 'http://localhost:3002',
    // apps/sadmin — the internal Super Admin portal. Origin only: the app is
    // served under basePath '/sadmin', but a CORS origin never carries a path.
    process.env.SADMIN_URL ?? 'http://localhost:3003',
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
