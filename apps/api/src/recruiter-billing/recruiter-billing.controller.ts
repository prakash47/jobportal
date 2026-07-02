import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AccessClaims } from '@jobportal/auth';
import { CurrentUser, Roles } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BillingProfileDto, CreateOrderDto, VerifyPaymentDto } from './dto';
import { RecruiterBillingService } from './recruiter-billing.service';

// L3 trusted boundary for recruiter billing. Reads (plans, subscription,
// history, invoices list) happen in the recruiter RSC via Prisma (reads/writes
// split); these endpoints own the money-moving mutations + the signed-URL
// invoice download. Order creation is rarer than team edits — 10/min is ample
// and caps checkout-spam.
const ORDER_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const VERIFY_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('recruiter/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RECRUITER')
export class RecruiterBillingController {
  constructor(private readonly billing: RecruiterBillingService) {}

  @Post('orders')
  @Throttle(ORDER_THROTTLE)
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = CreateOrderDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.billing.createOrder(user.sub, parsed.data);
  }

  @Post('orders/:id/verify')
  @Throttle(VERIFY_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = VerifyPaymentDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.billing.verifyCheckout(user.sub, id, parsed.data);
  }

  // Dev-only (keyless stub mode): the service 404s this route whenever real
  // Razorpay keys are configured or NODE_ENV is production.
  @Post('orders/:id/simulate')
  @Throttle(ORDER_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async simulate(@CurrentUser() user: AccessClaims, @Param('id', ParseIntPipe) id: number) {
    return this.billing.simulatePayment(user.sub, id);
  }

  @Put('profile')
  @Throttle(ORDER_THROTTLE)
  async upsertProfile(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = BillingProfileDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.billing.upsertBillingProfile(user.sub, parsed.data);
  }

  // Plain-navigation friendly (the recruiter app links straight here; the auth
  // cookie rides along) — streams the PDF with an attachment disposition.
  @Get('invoices/:id/download')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async downloadInvoice(
    @CurrentUser() user: AccessClaims,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { pdf, filename } = await this.billing.getInvoicePdf(user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(pdf);
  }
}
