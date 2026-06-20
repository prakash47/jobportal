import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@jobportal/db';
import type { User } from '@jobportal/db';

// Google OAuth 2.0 — Authorization Code flow with PKCE (SRS §4.12.6, pulled
// into Phase 1 per ADR 0001). No third-party SDK: the code↔token exchange runs
// server-side over TLS with the client secret + PKCE verifier, so the returned
// id_token is trusted after validating aud / iss / exp / email_verified.
//
// Blank credentials → isConfigured() is false and the routes 404 (the same
// "secret blank = feature no-ops" idiom used by Resend/R2). The web hides the
// buttons in that state.

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface GoogleAuthRequest {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const VALID_ISS = new Set(['accounts.google.com', 'https://accounts.google.com']);

// Prisma unique-constraint violation (P2002) — used to make the OAuth user
// create idempotent under concurrent/duplicate callbacks.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class GoogleOAuthService {
  private get clientId(): string | undefined {
    return process.env.GOOGLE_CLIENT_ID || undefined;
  }
  private get clientSecret(): string | undefined {
    return process.env.GOOGLE_CLIENT_SECRET || undefined;
  }
  private get redirectUri(): string | undefined {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  // Build the Google consent URL with PKCE (S256) + a CSRF `state`. The caller
  // persists { state, codeVerifier } in a short-lived httpOnly cookie and
  // redirects the browser to `url`.
  createAuthRequest(): GoogleAuthRequest {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    });
    return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, codeVerifier, nonce };
  }

  // Exchange the authorization code (with client_secret + PKCE verifier) and
  // return the validated Google profile.
  async exchangeCodeForProfile(
    code: string,
    codeVerifier: string,
    expectedNonce: string,
  ): Promise<GoogleProfile> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri!,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) throw new Error('Google token response missing id_token');
    return this.parseIdToken(json.id_token, expectedNonce);
  }

  private parseIdToken(idToken: string, expectedNonce: string): GoogleProfile {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed id_token');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
      aud?: string;
      iss?: string;
      exp?: number;
      nonce?: string;
    };
    if (payload.aud !== this.clientId) throw new Error('id_token aud mismatch');
    if (!payload.iss || !VALID_ISS.has(payload.iss)) throw new Error('id_token iss invalid');
    if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('id_token expired');
    if (!payload.nonce || payload.nonce !== expectedNonce) throw new Error('id_token nonce mismatch');
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!payload.sub || !payload.email || !emailVerified) {
      throw new Error('Google account email is not verified');
    }
    const email = payload.email.toLowerCase();
    return {
      sub: payload.sub,
      email,
      name: payload.name?.trim() || (email.split('@')[0] ?? email),
      picture: payload.picture ?? null,
    };
  }

  // Resolve a Google identity to a User: match by googleId, else link to an
  // existing same-email account (Google verified the email), else create a new
  // CANDIDATE. `isNew` drives the onboarding redirect.
  async findOrCreateUser(profile: GoogleProfile): Promise<{ user: User; isNew: boolean }> {
    const byGoogle = await prisma.user.findUnique({ where: { googleId: profile.sub } });
    if (byGoogle) return { user: byGoogle, isNew: false };

    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      // Link Google to the existing account. Keep their chosen name + provider
      // (a LOCAL user keeps password login); only attach googleId, confirm the
      // email, and adopt the avatar if they have none.
      const user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.sub,
          emailVerified: true,
          image: byEmail.image ?? profile.picture,
        },
      });
      return { user, isNew: false };
    }

    try {
      const user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          provider: 'GOOGLE',
          googleId: profile.sub,
          image: profile.picture,
          emailVerified: true, // Google-verified email — satisfies FR-4.12.8 gating
          role: 'CANDIDATE',
          // passwordHash stays null — OAuth-only account.
        },
      });
      // Provision the Candidate row up front (same lazy row the /profile page
      // would create on first visit).
      await prisma.candidate.create({ data: { userId: user.id } }).catch(() => undefined);
      return { user, isNew: true };
    } catch (err) {
      // A concurrent/duplicate callback won the create race (googleId + email
      // are @unique). Converge on the row it created instead of erroring out.
      if (isUniqueViolation(err)) {
        const existing = await prisma.user.findFirst({
          where: { OR: [{ googleId: profile.sub }, { email: profile.email }] },
        });
        if (existing) return { user: existing, isNew: false };
      }
      throw err;
    }
  }
}
