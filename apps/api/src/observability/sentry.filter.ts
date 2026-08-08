import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  IntrinsicException,
  Logger,
} from '@nestjs/common';
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
  // Named 'ExceptionsHandler' so the output is indistinguishable from the log
  // Nest's own BaseExceptionFilter used to emit. Writing the response here
  // means we no longer reach super.catch(), and its
  // `BaseExceptionFilter.logger.error(exception)` went with it — leaving a
  // bare 500 with no stack in the console, nothing in Sentry when SENTRY_DSN
  // is blank (the documented local-dev setup), and a response body
  // deliberately stripped of the message. This log is NOT gated on
  // isTelemetryEnabled(): killswitch.telemetry exists to stop Sentry traffic,
  // and it must not also blind the server's own logs.
  private readonly logger = new Logger('ExceptionsHandler');

  // Recognises a genuine `http-errors` object.
  //
  // Not every client error is an HttpException: Express's body-parser throws
  // http-errors — `entity.too.large` (413, and express.json defaults to a
  // 100kb limit), `request.aborted` (400), `charset.unsupported` (415) — which
  // reach this filter because Nest installs its exception layer as Express
  // error middleware. Nest's own handleUnknownError honoured their
  // `statusCode` via isHttpError; writing the response ourselves skipped that
  // and collapsed all of them to 500.
  //
  // The PRESENCE of a boolean `expose` is what identifies the library, and it
  // is load-bearing rather than decoration. Duck-typing on `statusCode` +
  // `message` alone is TOO WIDE: an @elastic/transport ResponseError has
  // exactly that shape, so an Elasticsearch failure on a public route was
  // adopting ES's own 4xx status, echoing its raw exception text (naming the
  // engine and its internal settings) to anonymous callers, and — because the
  // 4xx branch skips Sentry — going completely unreported.
  //
  // Verified against the installed packages: http-errors sets expose=true on
  // 4xx and expose=false on 5xx; ES's ResponseError leaves it undefined. So
  // `typeof expose === 'boolean'` means "a real http-errors object" and the
  // VALUE then says whether its message is safe to return — which is exactly
  // what the library documents `expose` for.
  //
  // Checked locally rather than via the inherited isHttpError for two further
  // reasons: Nest's version is a bare truthiness test, and depending on a
  // base-class method makes this filter untestable wherever
  // BaseExceptionFilter is stubbed — which its own test does.
  private static asHttpError(
    e: unknown,
  ): { statusCode: number; message: string; expose: boolean } | null {
    if (typeof e !== 'object' || e === null) return null;
    const { statusCode, message, expose } = e as {
      statusCode?: unknown;
      message?: unknown;
      expose?: unknown;
    };
    if (typeof expose !== 'boolean') return null;
    if (typeof message !== 'string') return null;
    if (
      typeof statusCode !== 'number' ||
      !Number.isInteger(statusCode) ||
      statusCode < 400 ||
      statusCode > 599
    ) {
      return null;
    }
    return { statusCode, message, expose };
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    // A genuine http-error keeps its status whether or not its message is
    // safe to show — a 502 from the library really is a 502. Only the MESSAGE
    // is gated on `expose`, further down.
    const httpErr = SentryGlobalFilter.asHttpError(exception);
    if (httpErr) return httpErr.statusCode;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  override async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const status = this.resolveStatus(exception);
    // 4xx is the expected user-error path; skip Sentry capture but still
    // format the response. Derived from the RESOLVED status, so a 413 from
    // body-parser is no longer reported as a 5xx — which would inflate exactly
    // the server-error rate this observability work exists to measure.
    const isExpected4xx = status < 500;

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
      const body = exception.getResponse();
      // Only FILL IN a Retry-After — never overwrite one. ThrottlerGuard sets
      // an accurate `timeToBlockExpire` immediately before it throws
      // (throttler.guard.js), and clobbering that with a guess would make the
      // very signal this branch advertises for mobile back-off less accurate
      // than what the API already emitted. retryAfterSeconds fills the gap
      // only for the budget quotas, which set no header of their own.
      if (res.getHeader('Retry-After') === undefined) {
        const retry = retryAfterSeconds(status, body);
        if (retry !== null) res.setHeader('Retry-After', String(retry));
      }
      res.status(status).json(withEnvelope(body, status));
      return;
    }

    // Everything else. Matches develop's logging: handleUnknownError logged
    // every non-IntrinsicException regardless of whether it carried a status,
    // and IntrinsicException is Nest's marker for exceptions it raises as
    // control flow and expects to stay quiet.
    if (!(exception instanceof IntrinsicException)) this.logger.error(exception);

    // A recognised http-error (413 payload too large, 400 request aborted…)
    // keeps its status and its message. Those strings are the library's own
    // and it flags them `expose: true` to mark them safe to return — which is
    // exactly what develop returned. Everything else, including any
    // third-party client error that merely LOOKS like one, stays an opaque 500
    // so no internal detail or stack reaches the client.
    const httpErr = SentryGlobalFilter.asHttpError(exception);
    const message = httpErr?.expose === true ? httpErr.message : 'Internal server error';
    res.status(status).json(withEnvelope(message, status));
  }
}
