import 'article_models.dart';

// Sample career-advice articles, served while the backend's /career-advice
// endpoints are built. Bodies are markdown (rendered on-device).

class _Seed {
  const _Seed({
    required this.slug,
    required this.title,
    required this.author,
    required this.daysAgo,
    required this.readMins,
    required this.tags,
    required this.excerpt,
    required this.body,
    required this.faqs,
  });

  final String slug, title, author, excerpt, body;
  final int daysAgo, readMins;
  final List<String> tags;
  final List<(String, String)> faqs;
}

const _seeds = <_Seed>[
  _Seed(
    slug: 'how-to-write-a-resume-that-gets-interviews',
    title: 'How to write a resume that gets interviews',
    author: 'Asha Rao',
    daysAgo: 2,
    readMins: 6,
    tags: ['resumes', 'job-search'],
    excerpt:
        'A calm, practical guide to a one-page resume that recruiters actually read.',
    body: '''## Start with impact, not duties
Recruiters skim. Lead each bullet with the **result**, then how you did it. "Cut checkout time 30% by rewriting the payment flow" beats "Responsible for payments".

## Keep it to one page
Unless you have 10+ years, one page is plenty. Cut anything older than a decade and anything generic.

## Tailor to the role
- Mirror the keywords in the job description
- Put the most relevant experience first
- Drop skills you would not want to be interviewed on

## Make it easy to scan
- Clear section headers
- Consistent dates on the right
- No dense paragraphs — bullets win

## Proofread twice
A single typo can cost you. Read it out loud, then have a friend check it.''',
    faqs: [
      (
        'How long should my resume be?',
        'One page for most people. Two only if you have many years of directly relevant experience.',
      ),
      (
        'Should I include a photo?',
        'In India it is common, but not required. A clean, text-first resume is always safe.',
      ),
    ],
  ),
  _Seed(
    slug: 'negotiating-your-salary-a-calm-structured-guide',
    title: 'Negotiating your salary: a calm, structured guide',
    author: 'Rohan Mehta',
    daysAgo: 5,
    readMins: 7,
    tags: ['salary', 'negotiation'],
    excerpt:
        'Negotiation is a conversation, not a confrontation. Here is how to prepare.',
    body: '''## Do your homework first
Know the market range for your role, city, and experience. Walk in with a number, not a feeling.

## Let them share first if you can
If asked for expectations, give a researched **range**, not a single figure.

## Negotiate the whole package
- Base pay
- Joining bonus
- ESOPs / equity
- Notice-period buyout

## Stay warm and specific
"Based on my experience with X and the market for this role, I was hoping for Y" is calm and hard to argue with.

## Get it in writing
Always confirm the final offer over email before you resign.''',
    faqs: [
      (
        'Is it rude to negotiate?',
        'No. Employers expect it. A polite, well-reasoned ask rarely backfires.',
      ),
      (
        'What if they say no?',
        'Ask what it would take to get there in 6–12 months, and get that plan in writing.',
      ),
    ],
  ),
  _Seed(
    slug: 'ace-your-next-technical-interview',
    title: 'Ace your next technical interview',
    author: 'Priya Nair',
    daysAgo: 8,
    readMins: 8,
    tags: ['interviews', 'engineering'],
    excerpt: 'Preparation beats talent on the day. A simple plan that works.',
    body: '''## Think out loud
Interviewers score your reasoning, not just the answer. Narrate your approach as you go.

## Clarify before you code
Ask about inputs, edge cases, and constraints. A minute of questions saves ten of rework.

## Have a structure
- Restate the problem
- Discuss a brute-force approach
- Optimise, then code
- Test with a small example

## Practise the basics
Arrays, strings, hash maps, and a couple of sorting/searching patterns cover a huge share of questions.

## Be honest
If you are stuck, say so and reason towards it. Faking rarely lands.''',
    faqs: [
      (
        'How many problems should I practise?',
        'Depth over breadth — 40–60 well-understood problems beats 300 rushed ones.',
      ),
      (
        'What if I do not finish in time?',
        'A clear, partly-working approach with good communication often still passes.',
      ),
    ],
  ),
  _Seed(
    slug: 'switching-careers-in-your-30s',
    title: 'Switching careers in your 30s',
    author: 'Vikram Sethi',
    daysAgo: 12,
    readMins: 5,
    tags: ['career-change'],
    excerpt: 'It is not too late. A grounded way to change direction without chaos.',
    body: '''## Name what transfers
You are not starting from zero. Communication, project management, and domain knowledge move with you.

## Bridge, do not leap
- Take on adjacent projects in your current job
- Do a small, real project in the new field
- Build one or two proof points before you switch

## Expect a dip, plan for it
A short pay or seniority dip is common. Budget for it and treat it as an investment.

## Tell your story clearly
Connect the dots for interviewers: why the change, and why now.''',
    faqs: [
      (
        'Will I have to start at the bottom?',
        'Rarely all the way. Your transferable experience usually places you above entry level.',
      ),
    ],
  ),
  _Seed(
    slug: 'remote-work-habits-that-actually-help',
    title: 'Remote work: habits that actually help',
    author: 'Neha Gupta',
    daysAgo: 15,
    readMins: 4,
    tags: ['remote', 'productivity'],
    excerpt: 'Remote is a skill. Small habits make the difference over time.',
    body: '''## Protect a start ritual
A short routine tells your brain "work now" — a walk, coffee, then the first task.

## Communicate more than feels natural
- Over-share status
- Default to writing
- Make your work visible

## Guard your focus
Batch messages. Turn off non-urgent notifications. Protect two deep-work blocks a day.

## End the day on purpose
Without a commute, you need a hard stop. Close the laptop and step away.''',
    faqs: [
      (
        'How do I stay visible when remote?',
        'Share progress proactively and keep your work written down where others can see it.',
      ),
    ],
  ),
  _Seed(
    slug: 'building-a-standout-linkedin-profile',
    title: 'Building a standout LinkedIn profile',
    author: 'Arjun Rao',
    daysAgo: 20,
    readMins: 5,
    tags: ['personal-branding', 'job-search'],
    excerpt: 'Recruiters search LinkedIn daily. Make yours easy to find and trust.',
    body: '''## Headline is prime real estate
Say what you do and the value you bring, not just your title.

## Write the About in first person
A short, human paragraph beats a wall of buzzwords.

## Show, do not just tell
- Add projects and outcomes
- Ask for a few specific recommendations
- Keep skills current

## Be findable
Use the terms recruiters actually search for in your field and city.''',
    faqs: [
      (
        'How often should I post?',
        'Consistency beats volume. Even once a month, sharing what you learn, compounds.',
      ),
    ],
  ),
];

ArticleSummary _toSummary(_Seed s) => ArticleSummary(
  slug: s.slug,
  title: s.title,
  authorName: s.author,
  excerpt: s.excerpt,
  publishedAt: DateTime.now().subtract(Duration(days: s.daysAgo)),
  readTimeMinutes: s.readMins,
  tags: s.tags,
);

ArticleDetail _toDetail(_Seed s) => ArticleDetail(
  slug: s.slug,
  title: s.title,
  body: s.body,
  authorName: s.author,
  excerpt: s.excerpt,
  publishedAt: DateTime.now().subtract(Duration(days: s.daysAgo)),
  updatedAt: DateTime.now().subtract(Duration(days: s.daysAgo)),
  readTimeMinutes: s.readMins,
  tags: s.tags,
  faqs: [for (final f in s.faqs) ArticleFaq(question: f.$1, answer: f.$2)],
);

/// The distinct tags across all sample articles (for the filter row).
List<String> mockArticleTags() {
  final set = <String>{};
  for (final s in _seeds) {
    set.addAll(s.tags);
  }
  return set.toList();
}

abstract final class ArticlesMock {
  static Future<ArticlesPage> list({String? tag, String? q, int page = 1}) async {
    await Future.delayed(const Duration(milliseconds: 350));
    var list = _seeds.toList();
    if (tag != null && tag.isNotEmpty) {
      list = list.where((s) => s.tags.contains(tag)).toList();
    }
    final needle = q?.trim().toLowerCase() ?? '';
    if (needle.isNotEmpty) {
      list = list
          .where(
            (s) =>
                s.title.toLowerCase().contains(needle) ||
                s.excerpt.toLowerCase().contains(needle),
          )
          .toList();
    }
    list.sort((a, b) => a.daysAgo.compareTo(b.daysAgo)); // newest first
    const pageSize = 12;
    final total = list.length;
    final start = (page - 1) * pageSize;
    final hits = start >= total
        ? <ArticleSummary>[]
        : list
              .sublist(start, (start + pageSize).clamp(0, total))
              .map(_toSummary)
              .toList();
    return ArticlesPage(hits: hits, total: total, page: page, pageSize: pageSize);
  }

  static Future<ArticleDetail?> detail(String slug) async {
    await Future.delayed(const Duration(milliseconds: 300));
    for (final s in _seeds) {
      if (s.slug == slug) return _toDetail(s);
    }
    return null;
  }
}
