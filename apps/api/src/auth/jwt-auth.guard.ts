import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { readAccessTokenCookie, verifyAccessToken, type AccessClaims } from '@jobportal/auth';
import type { Request } from 'express';

export interface AuthedRequest extends Request {
  user?: AccessClaims;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const fromCookie = readAccessTokenCookie(req);
    const auth = req.headers.authorization;
    const fromHeader = auth && auth.startsWith('Bearer ') ? auth.substring(7) : undefined;
    const token = fromCookie ?? fromHeader;
    if (!token) throw new UnauthorizedException('No access token');

    try {
      req.user = verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
