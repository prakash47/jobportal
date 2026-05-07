import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  // STUB: real check arrives in feature/auth-jwt-system. Until JWT auth lands,
  // every admin endpoint rejects with 403. The endpoint shape is wired so the
  // controller can be swapped over without touching consumer code.
  canActivate(_context: ExecutionContext): boolean {
    throw new ForbiddenException(
      'AdminGuard not yet wired — implement in feature/auth-jwt-system before exposing admin endpoints.',
    );
  }
}
