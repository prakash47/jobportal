import { Controller, Get, Logger, NotFoundException, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { cookieEnvFromProcess, setAuthCookies } from '@jobportal/auth';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';

const TX_COOKIE = 'g_oauth_tx';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Same-origin path guard (mirrors the web's safeNext): only allow internal
// paths as the post-login destination, never an absolute/other-origin URL.
function safePath(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

// Google OAuth routes live under /auth/* so the refresh cookie (path=/auth)
// and the existing Session/rotation model apply unchanged. SRS §4.12.6 / ADR 0001.
@Controller('auth/google')
export class GoogleOAuthController {
  private readonly logger = new Logger(GoogleOAuthController.name);

  constructor(
    private readonly google: GoogleOAuthService,
    private readonly auth: AuthService,
  ) {}

  // Capability probe — the web uses this to show/hide the "Continue with
  // Google" buttons. Public; leaks nothing beyond on/off.
  @Get('status')
  status() {
    return { enabled: this.google.isConfigured() };
  }

  // Begin the flow: stash the PKCE/state transaction in a short-lived httpOnly
  // cookie, then 302 to Google. 404 when unconfigured (defense-in-depth atop
  // the hidden buttons).
  @Get()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  start(@Query('next') next: string | undefined, @Res() res: Response) {
    if (!this.google.isConfigured()) throw new NotFoundException();
    const { url, state, codeVerifier, nonce } = this.google.createAuthRequest();
    const tx = Buffer.from(
      JSON.stringify({ state, codeVerifier, nonce, next: safePath(next, '') }),
    ).toString('base64url');
    res.cookie(TX_COOKIE, tx, {
      httpOnly: true,
      secure: cookieEnvFromProcess().secure,
      sameSite: 'lax', // survives Google's top-level redirect back to /callback
      path: '/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  }

  // Google redirects back with ?code&state. Validate state (CSRF), exchange the
  // code (PKCE), resolve the user, mint our session cookies, and bounce to the
  // web app: new accounts → /onboarding, existing → /profile (or ?next=).
  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!this.google.isConfigured()) throw new NotFoundException();

    const secure = cookieEnvFromProcess().secure;
    const clearTx = () =>
      res.clearCookie(TX_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/auth/google', secure });

    try {
      const raw = (req.cookies as Record<string, string> | undefined)?.[TX_COOKIE];
      if (!raw || !code || !state) throw new Error('Missing OAuth transaction');
      const tx = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
        state: string;
        codeVerifier: string;
        nonce: string;
        next?: string;
      };
      if (tx.state !== state) throw new Error('OAuth state mismatch');

      const profile = await this.google.exchangeCodeForProfile(code, tx.codeVerifier, tx.nonce);
      const { user, isNew } = await this.google.findOrCreateUser(profile);

      const result = await this.auth.issueSession(
        user,
        req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined,
        req.ip,
      );
      setAuthCookies(res, result.accessToken, result.refreshToken, cookieEnvFromProcess());
      clearTx();

      const dest = isNew ? '/onboarding' : safePath(tx.next, '/profile');
      res.redirect(`${WEB_URL}${dest}`);
    } catch (err) {
      clearTx();
      this.logger.warn(`Google OAuth callback failed: ${err instanceof Error ? err.message : 'unknown'}`);
      res.redirect(`${WEB_URL}/login?error=google`);
    }
  }
}
