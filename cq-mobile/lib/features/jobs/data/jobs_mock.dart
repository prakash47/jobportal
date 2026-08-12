import '../../../core/format/job_format.dart';
import 'job_models.dart';

/// Sample job data used while the backend's public `/jobs` endpoints are being
/// built. The repository serves these when [AppConfig.useMockData] is true, and
/// switches to the live API when it's false — nothing else changes.
///
/// Salaries are written in LPA and converted to paise (the API's unit) so the
/// on-device formatter produces the same output it will for live data.
const int _lpaPaise = 10000000; // 1 LPA = ₹1,00,000 = 1,00,00,000 paise

class _Seed {
  const _Seed({
    required this.id,
    required this.title,
    required this.slug,
    required this.company,
    required this.companySlug,
    required this.city,
    required this.citySlug,
    required this.skills,
    required this.daysAgo,
    required this.short,
    required this.employmentType,
    required this.workMode,
    required this.industrySlug,
    required this.industryName,
    this.salMinLpa,
    this.salMaxLpa,
    this.expMinM,
    this.expMaxM,
    this.saved = false,
    this.applied = false,
  });

  final int id;
  final String title, slug, company, companySlug, city, citySlug;
  final List<String> skills;
  final int daysAgo;
  final String short, employmentType, workMode, industrySlug, industryName;
  final int? salMinLpa, salMaxLpa, expMinM, expMaxM;
  final bool saved, applied;
}

const _seeds = <_Seed>[
  _Seed(
    id: 12001,
    title: 'Senior Flutter Engineer',
    slug: 'senior-flutter-engineer-lumen-labs-12001',
    company: 'Lumen Labs',
    companySlug: 'lumen-labs',
    city: 'Bengaluru',
    citySlug: 'bengaluru',
    skills: ['Flutter', 'Dart', 'Riverpod', 'REST APIs', 'Firebase'],
    daysAgo: 2,
    short: 'Build our flagship mobile app used by millions of job seekers.',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    industrySlug: 'software',
    industryName: 'Software',
    salMinLpa: 24,
    salMaxLpa: 36,
    expMinM: 48,
    expMaxM: 84,
  ),
  _Seed(
    id: 12002,
    title: 'Backend Engineer (Node.js)',
    slug: 'backend-engineer-node-js-finixo-12002',
    company: 'Finixo',
    companySlug: 'finixo',
    city: 'Pune',
    citySlug: 'pune',
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS', 'Redis'],
    daysAgo: 5,
    short: 'Own the services that power payments for thousands of businesses.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    industrySlug: 'software',
    industryName: 'Software',
    salMinLpa: 18,
    salMaxLpa: 30,
    expMinM: 36,
    expMaxM: 72,
    saved: true,
  ),
  _Seed(
    id: 12003,
    title: 'Product Designer',
    slug: 'product-designer-nova-health-12003',
    company: 'Nova Health',
    companySlug: 'nova-health',
    city: 'Bengaluru',
    citySlug: 'bengaluru',
    skills: ['Figma', 'UI Design', 'Prototyping', 'Design Systems'],
    daysAgo: 1,
    short: 'Design calm, trustworthy healthcare experiences end to end.',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    industrySlug: 'healthcare',
    industryName: 'Healthcare',
    salMinLpa: 16,
    salMaxLpa: 26,
    expMinM: 24,
    expMaxM: 60,
  ),
  _Seed(
    id: 12004,
    title: 'Data Analyst',
    slug: 'data-analyst-kite-retail-12004',
    company: 'Kite Retail',
    companySlug: 'kite-retail',
    city: 'Gurugram',
    citySlug: 'gurugram',
    skills: ['SQL', 'Python', 'Power BI', 'Excel'],
    daysAgo: 3,
    short: 'Turn retail data into decisions the whole company acts on.',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    industrySlug: 'analytics',
    industryName: 'Analytics',
    salMinLpa: 8,
    salMaxLpa: 14,
    expMinM: 0,
    expMaxM: 24,
  ),
  _Seed(
    id: 12005,
    title: 'Sales Executive',
    slug: 'sales-executive-brighthomes-12005',
    company: 'BrightHomes',
    companySlug: 'brighthomes',
    city: 'Mumbai',
    citySlug: 'mumbai',
    skills: ['Communication', 'CRM', 'Negotiation'],
    daysAgo: 6,
    short: 'Help families find their next home and close deals that matter.',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    industrySlug: 'real-estate',
    industryName: 'Real Estate',
    salMinLpa: 4,
    salMaxLpa: 7,
    expMinM: 0,
    expMaxM: 24,
  ),
  _Seed(
    id: 12006,
    title: 'Android Engineer',
    slug: 'android-engineer-playverse-12006',
    company: 'Playverse',
    companySlug: 'playverse',
    city: 'Hyderabad',
    citySlug: 'hyderabad',
    skills: ['Kotlin', 'Android', 'Jetpack Compose', 'Coroutines'],
    daysAgo: 4,
    short: 'Ship delightful gaming experiences to millions of players.',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    industrySlug: 'gaming',
    industryName: 'Gaming',
    salMinLpa: 20,
    salMaxLpa: 32,
    expMinM: 36,
    expMaxM: 72,
  ),
  _Seed(
    id: 12007,
    title: 'DevOps Engineer',
    slug: 'devops-engineer-cloudspur-12007',
    company: 'Cloudspur',
    companySlug: 'cloudspur',
    city: 'Remote',
    citySlug: 'remote',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
    daysAgo: 7,
    short: 'Keep a high-scale platform fast, reliable, and cheap to run.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    industrySlug: 'software',
    industryName: 'Software',
    salMinLpa: 22,
    salMaxLpa: 38,
    expMinM: 48,
    expMaxM: 96,
  ),
  _Seed(
    id: 12008,
    title: 'Marketing Manager',
    slug: 'marketing-manager-zesta-foods-12008',
    company: 'Zesta Foods',
    companySlug: 'zesta-foods',
    city: 'Delhi',
    citySlug: 'delhi',
    skills: ['SEO', 'Content', 'Growth', 'Analytics'],
    daysAgo: 8,
    short: 'Grow a beloved food brand across digital and offline channels.',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    industrySlug: 'fmcg',
    industryName: 'FMCG',
    salMinLpa: 12,
    salMaxLpa: 20,
    expMinM: 60,
    expMaxM: 120,
  ),
  _Seed(
    id: 12009,
    title: 'QA Engineer',
    slug: 'qa-engineer-finixo-12009',
    company: 'Finixo',
    companySlug: 'finixo',
    city: 'Pune',
    citySlug: 'pune',
    skills: ['Manual Testing', 'Selenium', 'API Testing'],
    daysAgo: 9,
    short: 'Guard quality across a fast-moving payments platform.',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    industrySlug: 'software',
    industryName: 'Software',
    salMinLpa: 10,
    salMaxLpa: 18,
    expMinM: 24,
    expMaxM: 60,
  ),
  _Seed(
    id: 12010,
    title: 'HR Executive',
    slug: 'hr-executive-nova-health-12010',
    company: 'Nova Health',
    companySlug: 'nova-health',
    city: 'Bengaluru',
    citySlug: 'bengaluru',
    skills: ['Recruitment', 'Onboarding', 'HRMS'],
    daysAgo: 10,
    short: 'Own hiring and people ops for a growing healthcare team.',
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    industrySlug: 'healthcare',
    industryName: 'Healthcare',
    salMinLpa: 5,
    salMaxLpa: 9,
    expMinM: 0,
    expMaxM: 36,
    applied: true,
  ),
  _Seed(
    id: 12011,
    title: 'Full-Stack Developer',
    slug: 'full-stack-developer-lumen-labs-12011',
    company: 'Lumen Labs',
    companySlug: 'lumen-labs',
    city: 'Bengaluru',
    citySlug: 'bengaluru',
    skills: ['React', 'Node.js', 'TypeScript', 'MongoDB'],
    daysAgo: 1,
    short: 'Build features across the stack for a product people love.',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    industrySlug: 'software',
    industryName: 'Software',
    salMinLpa: 15,
    salMaxLpa: 28,
    expMinM: 24,
    expMaxM: 60,
  ),
  _Seed(
    id: 12012,
    title: 'UX Researcher (Contract)',
    slug: 'ux-researcher-playverse-12012',
    company: 'Playverse',
    companySlug: 'playverse',
    city: 'Hyderabad',
    citySlug: 'hyderabad',
    skills: ['User Research', 'Usability', 'Interviews'],
    daysAgo: 12,
    short: 'Uncover what players need and turn it into product direction.',
    employmentType: 'CONTRACTOR',
    workMode: 'REMOTE',
    industrySlug: 'gaming',
    industryName: 'Gaming',
    salMinLpa: 14,
    salMaxLpa: 22,
    expMinM: 36,
    expMaxM: 72,
  ),
  _Seed(
    id: 12013,
    title: 'Business Analyst Intern',
    slug: 'business-analyst-intern-kite-retail-12013',
    company: 'Kite Retail',
    companySlug: 'kite-retail',
    city: 'Gurugram',
    citySlug: 'gurugram',
    skills: ['Excel', 'SQL', 'Communication'],
    daysAgo: 2,
    short: 'A 6-month internship to learn analytics on real retail data.',
    employmentType: 'INTERN',
    workMode: 'ONSITE',
    industrySlug: 'analytics',
    industryName: 'Analytics',
  ),
];

JobSummary _toSummary(_Seed s) => JobSummary(
  id: s.id,
  title: s.title,
  canonicalSlug: s.slug,
  company: JobCompany(id: s.id, name: s.company, slug: s.companySlug),
  postedAt: DateTime.now().subtract(Duration(days: s.daysAgo)),
  city: s.city,
  citySlug: s.citySlug,
  salaryMin: s.salMinLpa == null ? null : s.salMinLpa! * _lpaPaise,
  salaryMax: s.salMaxLpa == null ? null : s.salMaxLpa! * _lpaPaise,
  minExperienceMonths: s.expMinM,
  maxExperienceMonths: s.expMaxM,
  skills: s.skills,
  shortDescription: s.short,
  isSaved: s.saved,
  isApplied: s.applied,
);

String _body(_Seed s) {
  final exp = s.expMinM == null ? 'Relevant' : '${(s.expMinM! / 12).round()}+ years of';
  final topSkills = s.skills.take(3).join(', ');
  final mode = (workModeLabels[s.workMode] ?? 'On-site').toLowerCase();
  return '''## About the role
${s.short}

As a ${s.title} at ${s.company}, you'll join a team that ships fast and cares about craft. This is a $mode role based in ${s.city}.

## What you'll do
- Own features end to end, from idea to production
- Partner closely with product, design, and engineering
- Write clean, well-tested, maintainable work
- Help raise the quality bar across the team

## What we're looking for
- $exp experience in a similar role
- Hands-on strength with $topSkills
- Clear communication and a bias for action

## Nice to have
- Experience at a fast-growing product company
- Side projects or work you're proud to show''';
}

JobDetail _toDetail(_Seed s) => JobDetail(
  id: s.id,
  canonicalSlug: s.slug,
  title: s.title,
  description: s.short,
  descriptionMarkdown: _body(s),
  shortDescription: s.short,
  status: 'ACTIVE',
  employmentType: s.employmentType,
  workMode: s.workMode,
  postedAt: DateTime.now().subtract(Duration(days: s.daysAgo)),
  expiresAt: DateTime.now().add(const Duration(days: 30)),
  salaryMinPaise: s.salMinLpa == null ? null : s.salMinLpa! * _lpaPaise,
  salaryMaxPaise: s.salMaxLpa == null ? null : s.salMaxLpa! * _lpaPaise,
  experienceMinYears: s.expMinM == null ? null : (s.expMinM! / 12).round(),
  experienceMaxYears: s.expMaxM == null ? null : (s.expMaxM! / 12).round(),
  cities: [s.city],
  skills: [
    for (var i = 0; i < s.skills.length; i++)
      JobSkill(
        id: i + 1,
        slug: s.skills[i].toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
        name: s.skills[i],
      ),
  ],
  company: JobCompany(
    id: s.id,
    name: s.company,
    slug: s.companySlug,
    websiteUrl: 'https://${s.companySlug}.example.com',
  ),
  industry: JobIndustry(slug: s.industrySlug, name: s.industryName),
  isSaved: s.saved,
  isApplied: s.applied,
);

/// Static-data source. Mirrors the API's search/detail behaviour closely enough
/// that the screens don't know the difference.
abstract final class JobsMock {
  static Future<JobsPage> search({
    String? q,
    int page = 1,
    String sort = 'relevance',
  }) async {
    await Future.delayed(const Duration(milliseconds: 350));
    var list = _seeds.map(_toSummary).toList();
    final needle = q?.trim().toLowerCase() ?? '';
    if (needle.isNotEmpty) {
      list = list
          .where(
            (j) =>
                j.title.toLowerCase().contains(needle) ||
                j.company.name.toLowerCase().contains(needle) ||
                (j.city ?? '').toLowerCase().contains(needle) ||
                j.skills.any((s) => s.toLowerCase().contains(needle)),
          )
          .toList();
    }
    if (sort == 'recent') {
      list.sort((a, b) => b.postedAt.compareTo(a.postedAt));
    } else if (sort == 'salary_desc') {
      list.sort((a, b) => (b.salaryMax ?? 0).compareTo(a.salaryMax ?? 0));
    }
    const pageSize = 20;
    final total = list.length;
    final start = (page - 1) * pageSize;
    final hits = start >= total
        ? <JobSummary>[]
        : list.sublist(start, (start + pageSize).clamp(0, total));
    return JobsPage(hits: hits, total: total, page: page, pageSize: pageSize);
  }

  static Future<JobDetail?> detail(String slug) async {
    await Future.delayed(const Duration(milliseconds: 300));
    for (final s in _seeds) {
      if (s.slug == slug) return _toDetail(s);
    }
    return null;
  }
}
