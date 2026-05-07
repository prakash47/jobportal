import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type AccessClaims, readAccessTokenCookie, verifyAccessToken } from '@jobportal/auth';
import type { Request } from 'express';

interface AuthedRequest extends Request {
  user?: AccessClaims;
}

// Real admin guard — wired in feature/auth-jwt-system.
// Verifies the access-token cookie (or Bearer header), then enforces ADMIN role.
// Per FR-4.12.10, ADMIN role is assigned only via direct DB write — never via UI.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const fromCookie = readAccessTokenCookie(req);
    const auth = req.headers.authorization;
    const fromHeader = auth && auth.startsWith('Bearer ') ? auth.substring(7) : undefined;
    const token = fromCookie ?? fromHeader;
    if (!token) throw new UnauthorizedException('No access token');

    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (claims.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required');
    }

    req.user = claims;
    return true;
  }
}
