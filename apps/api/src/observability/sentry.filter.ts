import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { isTelemetryEnabled } from '@jobportal/observability';

// Phase 1 item 18 — captures every unhandled exception that bubbles
// past per-route filters. Gated by killswitch.telemetry so an admin can
// instantly stop Sentry traffic without redeploying.
//
// We deliberately DON'T capture HttpException subclasses (Bad/Forbidden/
// NotFound/etc.) by default — those are expected control flow, not
// errors. Only 5xx-flavoured exceptions and bare Errors reach Sentry.
@Catch()
export class SentryGlobalFilter extends BaseExceptionFilter {
  override async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    // HTTP 4xx is expected user-error path; skip Sentry capture but
    // still let BaseExceptionFilter format the response.
    const isExpected4xx =
      exception instanceof HttpException && exception.getStatus() < 500;

    if (!isExpected4xx && (await isTelemetryEnabled())) {
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
