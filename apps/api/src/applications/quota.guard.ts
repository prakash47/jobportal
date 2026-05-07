import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { ApplicationQuotaService } from './quota.service';

// Layer 1 of three-layer enforcement (CLAUDE.md §4 / SRS §4.11.16-17).
// Composed AFTER JwtAuthGuard in the controller decorator order so req.user
// is already populated. The actual increment happens in the service layer
// after prisma.application.create succeeds (Layer 3) so a P2002 duplicate-
// apply does not cost a slot.

@Injectable()
export class ApplicationQuotaGuard implements CanActivate {
  constructor(private readonly quota: ApplicationQuotaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return true; // JwtAuthGuard would already have rejected
    await this.quota.preflight(req.user.sub);
    return true;
  }
}
