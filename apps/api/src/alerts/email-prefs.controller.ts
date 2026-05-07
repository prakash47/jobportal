import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AccessClaims } from '@jobportal/auth';
import { prisma, Prisma, type EmailPreference } from '@jobportal/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// SRS §4.13.4 — read-only-ish per-user channel toggles. Lazily provisioned
// on first read so a freshly-signed-up user gets sane defaults
// (jobAlerts ON, applicationStatus ON, productNews OFF) without an extra
// onboarding step.

const PrefsPatchDto = z
  .object({
    jobAlertsEnabled: z.boolean().optional(),
    applicationStatusEnabled: z.boolean().optional(),
    productNewsEnabled: z.boolean().optional(),
  })
  .strict();

async function getOrCreate(userId: number): Promise<EmailPreference> {
  const existing = await prisma.emailPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.emailPreference.create({ data: { userId } });
}

@Controller('me/email-prefs')
@UseGuards(JwtAuthGuard)
export class EmailPrefsController {
  @Get()
  get(@CurrentUser() user: AccessClaims): Promise<EmailPreference> {
    return getOrCreate(user.sub);
  }

  @Patch()
  async patch(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    const parsed = PrefsPatchDto.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await getOrCreate(user.sub); // ensure row exists
    const data: Prisma.EmailPreferenceUpdateInput = {};
    if (parsed.data.jobAlertsEnabled !== undefined) data.jobAlertsEnabled = parsed.data.jobAlertsEnabled;
    if (parsed.data.applicationStatusEnabled !== undefined)
      data.applicationStatusEnabled = parsed.data.applicationStatusEnabled;
    if (parsed.data.productNewsEnabled !== undefined)
      data.productNewsEnabled = parsed.data.productNewsEnabled;
    return prisma.emailPreference.update({ where: { userId: user.sub }, data });
  }
}
