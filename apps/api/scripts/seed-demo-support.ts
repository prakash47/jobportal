// Dev helper: put a handful of SupportTicket / SupportTicketMessage /
// SupportTicketNote / SupportContactMessage rows in the LOCAL database so
// /sadmin/support can actually be looked at.
//
// ⚠ WHY THIS EXISTS. `pnpm db:seed` and the demo seeds create companies,
// recruiters, jobs and applications, but nothing anywhere creates a support
// ticket — a fresh clone renders an empty inbox on every tab, so the console
// ships having never displayed a row. Raising one by hand means signing into
// apps/recruiter, finding Help & Support and filling the form, per state, per
// developer.
//
// This is the same reasoning as seed-demo-transactions.ts, and that script's
// note is worth repeating: the billing module sat with two broken
// `pg_advisory_xact_lock()` calls for six weeks precisely because its tables
// were empty and every test mocked Prisma. Rows you can look at catch what
// mocked tests structurally cannot.
//
// The rows below cover the states the console renders differently, including
// the ones easy to get wrong:
//   1. OPEN, no replies          — the landing tab must not be empty
//   2. IN_PROGRESS + thread      — both message styles, plus TWO internal notes
//   3. RESOLVED, resolvedAt set  — the lifecycle line
//   4. CLOSED, resolved THEN closed — proves resolvedAt survives the close,
//      which is the regression this branch fixed; before it, this row would
//      render a close time and no resolution time at all
//   5. a note by a NONEXISTENT author id — renders "Unknown admin" rather than
//      blank, the deleted-account case that has no other way to occur locally
//   + two SupportContactMessage rows, one signed-in and one with a submitted
//     email that differs from the account's, which is its own render branch
//
// Local dev only. Refuses to run against a non-local DATABASE_URL.
//
//   tsx apps/api/scripts/seed-demo-support.ts          # insert
//   tsx apps/api/scripts/seed-demo-support.ts --clean  # remove them again
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

const LOCAL_DB = /localhost|127\.0\.0\.1|::1|\.local|\.internal/;

// Marks every row this script creates so --clean removes exactly them and
// nothing else. Prefixing the SUBJECT is what makes that possible: these tables
// carry no external id to key on the way PaymentOrder.razorpayOrderId does.
const DEMO_PREFIX = '[demo] ';

// An id no User row will ever have, used for the deleted-author note. Kept well
// below the int4 ceiling so it is a plausible id rather than an overflow.
const GHOST_ADMIN_ID = 2_000_000_001;

async function main(): Promise<void> {
  const clean = process.argv.includes('--clean');

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!LOCAL_DB.test(dbUrl)) {
    console.error(
      'Refusing to run: DATABASE_URL does not look local. This script writes fake support rows.',
    );
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import('@jobportal/db');

  if (clean) {
    // Messages and notes are ON DELETE CASCADE from SupportTicket, so deleting
    // the tickets takes them with it — no separate pass needed, unlike the
    // transactions script whose invoices are SetNull.
    const tickets = await prisma.supportTicket.deleteMany({
      where: { subject: { startsWith: DEMO_PREFIX } },
    });
    const contacts = await prisma.supportContactMessage.deleteMany({
      where: { subject: { startsWith: DEMO_PREFIX } },
    });
    console.log(
      `Removed ${tickets.count} demo ticket(s) and ${contacts.count} demo contact message(s).`,
    );
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.supportTicket.count({
    where: { subject: { startsWith: DEMO_PREFIX } },
  });
  if (existing > 0) {
    console.log(`${existing} demo ticket(s) already present. Run with --clean first to reset.`);
    await prisma.$disconnect();
    return;
  }

  // Two DIFFERENT companies, so the ?q search over company name has something
  // to actually discriminate between rather than matching every row.
  const companies = await prisma.company.findMany({ orderBy: { id: 'asc' }, take: 2 });
  const first = companies[0];
  const second = companies[1] ?? first;
  if (!first || !second) {
    console.error(
      'Need at least one company with a recruiter. Run `pnpm db:seed` and `pnpm --filter @jobportal/db db:seed:demo:full` first.',
    );
    await prisma.$disconnect();
    return;
  }

  const recruiterA = await prisma.recruiter.findFirst({
    where: { companyId: first.id },
    select: { userId: true },
  });
  const recruiterB =
    (await prisma.recruiter.findFirst({
      where: { companyId: second.id },
      select: { userId: true },
    })) ?? recruiterA;

  if (!recruiterA || !recruiterB) {
    console.error(
      'Need at least one recruiter. Run `pnpm --filter @jobportal/db db:seed:demo:full` first.',
    );
    await prisma.$disconnect();
    return;
  }

  // A real ADMIN to author the notes, so the console renders a real name on
  // most of them and "Unknown admin" only on the deliberate ghost below.
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const authorId = admin?.id ?? GHOST_ADMIN_ID;
  if (!admin) {
    console.log('No ADMIN user found — every note will render as "Unknown admin".');
  }

  // Fixed instants rather than offsets from "now", so two runs produce the same
  // rows and a screenshot stays reproducible. Spread across several IST days so
  // the queue's ordering is visible.
  const at = (iso: string): Date => new Date(iso);

  // 1. OPEN with no replies — the landing tab must not be empty on a fresh clone.
  await prisma.supportTicket.create({
    data: {
      userId: recruiterA.userId,
      companyId: first.id,
      subject: `${DEMO_PREFIX}Cannot upload our company logo`,
      description:
        'The logo upload on the company profile spins forever and then says "Something went wrong". PNG, about 400KB.',
      category: 'TECHNICAL',
      status: 'OPEN',
      createdAt: at('2026-08-17T04:30:00.000Z'),
    },
  });

  // 2. IN_PROGRESS with a two-sided thread and TWO internal notes — the screen
  //    this whole branch exists for. One note is by the real admin, one by an id
  //    that does not resolve, so both author branches render on one page.
  await prisma.supportTicket.create({
    data: {
      userId: recruiterB.userId,
      companyId: second.id,
      subject: `${DEMO_PREFIX}Billing invoice shows the wrong GSTIN`,
      description:
        'Our last invoice carries an old GSTIN. We updated it on the company profile in July. Can this be reissued?',
      category: 'BILLING',
      status: 'IN_PROGRESS',
      createdAt: at('2026-08-15T09:10:00.000Z'),
      messages: {
        create: [
          {
            authorId: recruiterB.userId,
            fromSupport: false,
            body: 'Adding our finance team — this is holding up our input credit claim.',
            createdAt: at('2026-08-15T09:12:00.000Z'),
          },
          {
            authorId,
            fromSupport: true,
            body: 'Thanks — checking with our finance side on whether a revised invoice can be issued. Will update by Thursday.',
            createdAt: at('2026-08-16T05:40:00.000Z'),
          },
        ],
      },
      notes: {
        create: [
          {
            authorId,
            body: 'A reissue needs a credit note against the original — the GST sequence is FY-consecutive so we cannot just edit it. Escalating to whoever owns invoice-number.ts.',
            createdAt: at('2026-08-16T05:45:00.000Z'),
          },
          {
            // Deliberately unresolvable: this is the only way to see the
            // deleted-admin branch locally.
            authorId: GHOST_ADMIN_ID,
            body: 'Left by a staff account that has since been removed — this note should read "Unknown admin".',
            createdAt: at('2026-08-16T06:00:00.000Z'),
          },
        ],
      },
    },
  });

  // 3. RESOLVED with a resolution time and a staff reply.
  await prisma.supportTicket.create({
    data: {
      userId: recruiterA.userId,
      companyId: first.id,
      subject: `${DEMO_PREFIX}Applicant emails going to spam`,
      description: 'Our team stopped seeing new-applicant notifications. Nothing changed our end.',
      category: 'APPLICANTS',
      status: 'RESOLVED',
      createdAt: at('2026-08-12T11:00:00.000Z'),
      resolvedAt: at('2026-08-13T07:20:00.000Z'),
      messages: {
        create: [
          {
            authorId,
            fromSupport: true,
            body: 'Your domain was rejecting our sender. Added us to the allowlist — please confirm you are receiving these again.',
            createdAt: at('2026-08-13T07:18:00.000Z'),
          },
        ],
      },
    },
  });

  // 4. CLOSED, having been RESOLVED first — BOTH timestamps set.
  //    This row is the regression guard made visible: before this branch,
  //    moving RESOLVED → CLOSED nulled resolvedAt, so the detail page showed a
  //    close time and no resolution time on every completed ticket.
  await prisma.supportTicket.create({
    data: {
      userId: recruiterB.userId,
      companyId: second.id,
      subject: `${DEMO_PREFIX}Duplicate job posting created by mistake`,
      description: 'We posted the same Senior Backend Engineer role twice. Can one be removed?',
      category: 'JOB_POSTING',
      status: 'CLOSED',
      createdAt: at('2026-08-05T08:00:00.000Z'),
      resolvedAt: at('2026-08-06T10:15:00.000Z'),
      closedAt: at('2026-08-08T04:00:00.000Z'),
      notes: {
        create: [
          {
            authorId,
            body: 'Closed after the recruiter confirmed. Both timestamps should be visible on this one — if the resolution time is missing, the resolvedAt fix has regressed.',
            createdAt: at('2026-08-08T04:01:00.000Z'),
          },
        ],
      },
    },
  });

  // Contact messages: one plain, one where the submitted email differs from the
  // signed-in account's — the form prefills from the session but stays editable,
  // and the console renders that mismatch as its own line.
  const contactUser = await prisma.user.findUnique({
    where: { id: recruiterA.userId },
    select: { email: true, name: true },
  });
  await prisma.supportContactMessage.createMany({
    data: [
      {
        userId: recruiterA.userId,
        name: contactUser?.name ?? 'Demo Recruiter',
        email: contactUser?.email ?? 'demo@example.com',
        subject: `${DEMO_PREFIX}Do you offer annual billing?`,
        message: 'We would rather pay yearly than monthly. Is there a discount for that?',
        createdAt: at('2026-08-14T06:00:00.000Z'),
      },
      {
        userId: recruiterA.userId,
        name: 'Finance Team',
        // Deliberately NOT the account's address.
        email: 'accounts@example.com',
        subject: `${DEMO_PREFIX}Please send invoices to our finance inbox`,
        message: 'Copy accounts@ on every invoice going forward. Thanks.',
        createdAt: at('2026-08-14T06:30:00.000Z'),
      },
    ],
  });

  console.log('Seeded 4 demo tickets (OPEN / IN_PROGRESS / RESOLVED / CLOSED), 3 messages,');
  // 3, not 4: two notes on the IN_PROGRESS ticket and one on the CLOSED one.
  // The count matters more here than in most log lines — this script exists so a
  // developer can check the console against known data, so an inflated number
  // sends them hunting for a dropped row in the notes query.
  console.log('3 internal notes (one by a deleted author) and 2 contact messages.');
  console.log('Open http://localhost:3003/sadmin/support to see them.');
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
