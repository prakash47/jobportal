import type { PrismaClient } from '../../generated/client';

// SRS §4.8 — three hand-curated sample articles. Diverse on purpose so all
// rendering paths get exercised by a fresh dev environment:
//   1. resume — has FAQs (FAQPage JSON-LD path)
//   2. portfolio — has a code block (Shiki highlighting path)
//   3. salary — plain prose
//
// idempotent via upsert keyed on slug.

interface SampleArticle {
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  status: 'PUBLISHED';
  publishedAt: Date;
  readTimeMinutes: number;
  tags: string[];
  body: string;
  faqs: { question: string; answer: string }[] | null;
}

const articles: SampleArticle[] = [
  {
    slug: 'how-to-write-a-resume-that-gets-read',
    title: 'How to write a resume that gets read',
    excerpt:
      'Recruiters skim. Your resume has about ten seconds to land. Here is what we have learned reviewing thousands of them.',
    authorName: 'JobPortal Editorial',
    status: 'PUBLISHED',
    publishedAt: new Date('2026-04-12T09:00:00Z'),
    readTimeMinutes: 6,
    tags: ['resume', 'applying'],
    body: `Most resumes do not fail because the candidate is unqualified. They fail because the recruiter cannot find the relevant signal in the time they have.

## Lead with what you shipped

Begin every bullet with a verb that means *delivered*. Not "responsible for", not "contributed to" — "shipped", "led", "reduced", "rewrote".

Bad:
> Responsible for improving the checkout page.

Good:
> Rewrote the checkout flow; cut drop-off from 38% to 22% over Q3.

## One page until you have ten years

If you have less than ten years of experience, force yourself to one page. The discipline of cutting reveals what you actually believe is most important.

## Skills section: be specific

A wall of two-word skills is a wall the recruiter will skip. Use a short paragraph instead:

> Backend: TypeScript on Node, Postgres, Redis. Familiar with Go for tooling. Comfortable with Kubernetes deployments via ArgoCD.

That tells me what role you will be effective in. "Java, Python, Go, TypeScript, Rust, C++" tells me you have read about programming.

## Tailor — actually tailor

Three lines reordered to match the JD wins more interviews than a long generic resume. Match the words in the posting where they apply honestly.`,
    faqs: [
      {
        question: 'Should I include a photo?',
        answer:
          'No, unless the role explicitly asks (rare in tech). Photos add nothing and create bias risk for the company that has to decide whether to look at them.',
      },
      {
        question: 'How far back should my work history go?',
        answer:
          'Roughly the last 10 years, or three roles, whichever covers more. Older roles can collapse to a single line at the bottom.',
      },
      {
        question: 'Is a one-line summary at the top worth it?',
        answer:
          'Only if it actually summarises. A vague "passionate engineer" line is wasted space; a specific "Backend engineer, 6 yrs, last shipped a real-time bidding system on Postgres" is gold.',
      },
    ],
  },
  {
    slug: 'what-recruiters-look-at-in-a-portfolio',
    title: 'What recruiters actually look at in a portfolio',
    excerpt:
      'A portfolio is a thirty-second test, not a demo reel. Here is what we click on first, what we skip, and how to make the first thirty seconds count.',
    authorName: 'JobPortal Editorial',
    status: 'PUBLISHED',
    publishedAt: new Date('2026-04-22T09:00:00Z'),
    readTimeMinutes: 5,
    tags: ['portfolio', 'applying'],
    body: `Most engineering portfolios bury the lede. We open the home page, see "Hi, I am X — designer / developer / etc.", and have to dig three levels for the actual work.

## Show one thing well

Pick one project. Put it on the home page. Explain what it is, what you built, what it took, in two paragraphs.

\`\`\`ts
// A README sells the project before any code does.
// Lead with the result, not the architecture.
export interface ProjectReadme {
  oneLineSummary: string;     // "Real-time bid engine, 50k req/s peak"
  myRole: string;             // "Designed and shipped end-to-end"
  resultMetric: string;       // "p99 dropped from 220ms to 38ms"
  whatWasHard: string;        // "Cross-AZ replication invariants"
}
\`\`\`

## Code is optional, README is not

We do not always read the code. We almost always read the README. A great README on a small project beats a sprawling repo with three commits and no docs.

## Live demos are a trust signal

If your project has a UI, *please* host it. A working URL — even a hobby URL on Vercel — is worth more than three screenshots. We click the link first.

## What to leave out

- College course projects, unless they are genuinely impressive
- Tutorial follow-throughs (we recognise them)
- Three-line scripts inflated into "Microservices Architecture"

The goal is to make a recruiter say *"this person ships."* Everything else is noise.`,
    faqs: null,
  },
  {
    slug: 'negotiating-salary-in-your-first-software-job',
    title: 'Negotiating salary in your first software job',
    excerpt:
      'You can negotiate. You should negotiate. The worst case is the offer stays the same — companies do not rescind for asking politely.',
    authorName: 'JobPortal Editorial',
    status: 'PUBLISHED',
    publishedAt: new Date('2026-05-02T09:00:00Z'),
    readTimeMinutes: 4,
    tags: ['salary', 'early-career'],
    body: `The biggest myth in early-career hiring is that the first offer is take-it-or-leave-it. It almost never is.

Companies expect a counter from senior hires and respect it from juniors. A polite, well-reasoned counter usually moves the number 5–15%, and the worst likely outcome is "we cannot stretch further" — not a rescinded offer.

## Have a number ready

Before the conversation, decide on three numbers: walk-away (below this you say no), comfortable (you would happily sign at this), aspirational (you would feel lucky). Anchor the conversation at aspirational; settle anywhere above walk-away.

## Compete, do not threaten

"I have an offer at X" is leverage. "If you do not match X I am taking it" is a threat. The first is information; the second is theatre. Companies dislike theatre and remember it.

## What to negotiate other than base

Joining bonus is the easiest lever for a company to pull — it does not affect their salary band logic. Stock grants are harder to move at junior level but worth asking. Notice period is sometimes flexible. Annual leave is usually fixed but not always.

## End the conversation early

Once the company commits to a number that you can sign at, sign. Do not push for that last 2% — the goodwill you keep is worth more than the marginal raise.`,
    faqs: null,
  },
];

export async function seedArticles(prisma: PrismaClient): Promise<void> {
  for (const a of articles) {
    await prisma.article.upsert({
      where: { slug: a.slug },
      update: {
        title: a.title,
        excerpt: a.excerpt,
        authorName: a.authorName,
        status: a.status,
        publishedAt: a.publishedAt,
        readTimeMinutes: a.readTimeMinutes,
        tags: a.tags,
        body: a.body,
        faqs: a.faqs ?? null,
      },
      create: {
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        authorName: a.authorName,
        status: a.status,
        publishedAt: a.publishedAt,
        readTimeMinutes: a.readTimeMinutes,
        tags: a.tags,
        body: a.body,
        faqs: a.faqs ?? undefined,
      },
    });
  }
}
