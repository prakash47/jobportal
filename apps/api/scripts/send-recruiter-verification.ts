// Ops helper: (re)send a recruiter email-verification link via Resend.
// Mirrors RecruiterWorkEmailService.issueAndSend for a given recruiterId so a
// recruiter whose original email was missed/expired can be re-verified while
// the proper in-app "resend" affordance is still pending (admin-console Task 16).
//
// The recipient is looked up from the DB by recruiterId (User.email) so the
// token and the address always match. Requires RESEND_API_KEY + RESEND_FROM in
// apps/api/.env (else delivery is a no-op stub, same as the running API).
//
//   tsx apps/api/scripts/send-recruiter-verification.ts <recruiterId> [--dry-run]
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load apps/api/.env explicitly so JWT_ACCESS_SECRET matches the running API
// (the verification token must verify against the same secret) and DATABASE_URL
// is present BEFORE @jobportal/db is imported (done dynamically in main() so
// the Prisma client instantiates after this runs — ESM hoists static imports).
config({ path: resolve(__dirname, '../.env') });

import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { renderEmailVerification } from '../src/email/templates/email-verification';

async function main(): Promise<void> {
  const recruiterId = Number(process.argv[2]);
  const dryRun = process.argv.includes('--dry-run');
  if (!Number.isFinite(recruiterId)) {
    console.error(
      'Usage: tsx apps/api/scripts/send-recruiter-verification.ts <recruiterId> [--dry-run]',
    );
    process.exitCode = 2;
    return;
  }

  // Dynamic import AFTER config() so the Prisma singleton sees DATABASE_URL.
  const { prisma } = await import('@jobportal/db');
  try {
    const recruiter = await prisma.recruiter.findUnique({
      where: { id: recruiterId },
      select: { workEmailVerified: true, user: { select: { email: true } } },
    });
    if (!recruiter) {
      console.error(`No recruiter with id ${recruiterId}.`);
      process.exitCode = 1;
      return;
    }
    const to = recruiter.user.email;

    const accessSecret = process.env.JWT_ACCESS_SECRET;
    if (!accessSecret) throw new Error('JWT_ACCESS_SECRET not set');
    const from = process.env.RESEND_FROM ?? 'JobPortal <noreply@jobportal.com>';

    // Same namespaced secret + claim shape as RecruiterWorkEmailService.
    const token = jwt.sign(
      { sub: recruiterId, purpose: 'recruiter-work-email' },
      `${accessSecret}:recruiter-work-email`,
      { algorithm: 'HS256', expiresIn: 24 * 60 * 60 },
    );
    const base = process.env.RECRUITER_URL ?? 'http://localhost:3001';
    const verifyUrl = `${base}/verify-email/${encodeURIComponent(token)}`;
    const rendered = renderEmailVerification({ verifyUrl });

    console.log(
      `recruiterId: ${recruiterId}${recruiter.workEmailVerified ? ' (already verified)' : ''}`,
    );
    console.log(`from:        ${from}`);
    console.log(`to:          ${to}`);
    if (dryRun) {
      console.log(`verifyUrl:   ${verifyUrl}`);
      console.log('DRY RUN — no email sent.');
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY not set (email would be a no-op stub).');
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.error) {
      console.error(`RESEND ERROR: ${result.error.name} — ${result.error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`SENT OK — Resend message id: ${result.data?.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
