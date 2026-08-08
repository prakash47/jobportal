import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';
import { retryAfterSeconds, withEnvelope } from '../common/http-error-envelope';

// Phase 1 item 18 — captures every unhandled exception that bubbles
// past per-route filters. Gated by killswitch.telemetry so an admin can
// instantly stop Sentry traffic without redeploying.
//
// We deliberately DON'T capture HttpException subclasses (Bad/Forbidden/
// NotFound/etc.) by default — those are expected control flow, not
// errors. Only 5xx-flavoured exceptions and bare Errors reach Sentry.
//
// It also shapes the response body (ADR 0002 decision 2). This filter is the
// single global filter, so it is the one place every error passes through.
// The envelope is Nest's own `{ statusCode, error, message }` — see
// common/http-error-envelope.ts for why codifying the existing shape rather
// than inventing one keeps all three web apps working untouched.
@Catch()
export class SentryGlobalFilter extends BaseExceptionFilter {
  override async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    // HTTP 4xx is expected user-error path; skip Sentry capture but
    // still format the response.
    const isExpected4xx =
      exception instanceof HttpException && exception.getStatus() < 500;

    if (!isExpected4xx && (await isTelemetryEnabled())) {
      Sentry.captureException(exception);
    }

    // Non-HTTP contexts (there are none today, but BullMQ processors and any
    // future RPC transport would land here) have no response to write — hand
    // straight back to Nest.
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const res = host.switchToHttp().getResponse<Response>();
    // If something upstream already started the response we cannot rewrite it;
    // let Nest's base filter deal with the (already-broken) situation.
    if (res.headersSent) {
      super.catch(exception, host);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const retry = retryAfterSeconds(status, body);
      // A mobile client cannot back off correctly without this, and unlike a
      // browser tab a phone that retries blindly burns battery and trips the
      // limiter again. Neither 429 path emitted it before.
      if (retry !== null) res.setHeader('Retry-After', String(retry));
      res.status(status).json(withEnvelope(body, status));
      return;
    }

    // Bare Error / unknown throw. Deliberately does NOT leak the message or
    // stack — the exception is already in Sentry above, and an installed
    // mobile client parsing a stack trace would be worse than useless.
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json(withEnvelope('Internal server error', status));
  }
}
