import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { RecruiterPostQuotaService } from './quota.service';

// Layer 1 of three-layer enforcement. JwtAuthGuard runs first (composed in
// the controller) so req.user is populated. The actual consumption lives in
// the recruiter-jobs service after the slug is generated, so a duplicate
// publish attempt cannot consume two slots.

@Injectable()
export class RecruiterPostQuotaGuard implements CanActivate {
  constructor(private readonly quota: RecruiterPostQuotaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return true; // JwtAuthGuard would already have rejected
    await this.quota.preflight(req.user.sub);
    return true;
  }
}
