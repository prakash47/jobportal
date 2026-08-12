import 'company_models.dart';

// Sample company data, served while the backend's public /companies endpoints
// are built. Company names/industries and the "open roles" slugs line up with
// the sample jobs, so tapping an opening lands on a real job detail.

class _Seed {
  const _Seed({
    required this.id,
    required this.name,
    required this.slug,
    required this.industry,
    required this.city,
    required this.rating,
    required this.reviews,
    required this.type,
    required this.employees,
    required this.founded,
    required this.verified,
    required this.about,
    required this.openings,
  });

  final int id;
  final String name, slug, industry, city, type, employees, about;
  final double rating;
  final int reviews, founded;
  final bool verified;

  /// (job title, real job canonicalSlug) so openings deep-link to job details.
  final List<(String, String)> openings;

  String get handle => '$slug-overview-$id';
  int get openRoles => openings.length;
}

const _seeds = <_Seed>[
  _Seed(
    id: 501,
    name: 'Lumen Labs',
    slug: 'lumen-labs',
    industry: 'Software',
    city: 'Bengaluru',
    rating: 4.4,
    reviews: 320,
    type: 'PRODUCT',
    employees: '201–500',
    founded: 2016,
    verified: true,
    about:
        'Lumen Labs builds developer-loved products used by teams around the world. We care about craft, speed, and shipping things people actually enjoy using.',
    openings: [
      ('Senior Flutter Engineer', 'senior-flutter-engineer-lumen-labs-12001'),
      ('Full-Stack Developer', 'full-stack-developer-lumen-labs-12011'),
    ],
  ),
  _Seed(
    id: 502,
    name: 'Finixo',
    slug: 'finixo',
    industry: 'Software',
    city: 'Pune',
    rating: 4.1,
    reviews: 210,
    type: 'STARTUP',
    employees: '51–200',
    founded: 2019,
    verified: true,
    about:
        'Finixo powers payments for thousands of Indian businesses. We are a small, focused team solving hard problems in fintech.',
    openings: [
      ('Backend Engineer (Node.js)', 'backend-engineer-node-js-finixo-12002'),
      ('QA Engineer', 'qa-engineer-finixo-12009'),
    ],
  ),
  _Seed(
    id: 503,
    name: 'Nova Health',
    slug: 'nova-health',
    industry: 'Healthcare',
    city: 'Bengaluru',
    rating: 3.9,
    reviews: 480,
    type: 'PRODUCT',
    employees: '501–1000',
    founded: 2014,
    verified: true,
    about:
        'Nova Health is making quality healthcare accessible and calm. We design trustworthy experiences for patients and providers alike.',
    openings: [
      ('Product Designer', 'product-designer-nova-health-12003'),
      ('HR Executive', 'hr-executive-nova-health-12010'),
    ],
  ),
  _Seed(
    id: 504,
    name: 'Kite Retail',
    slug: 'kite-retail',
    industry: 'Analytics',
    city: 'Gurugram',
    rating: 3.6,
    reviews: 150,
    type: 'PRIVATE',
    employees: '1000–5000',
    founded: 2009,
    verified: false,
    about:
        'Kite Retail brings data-driven decisions to modern retail — from supply chains to storefronts across India.',
    openings: [
      ('Data Analyst', 'data-analyst-kite-retail-12004'),
      ('Business Analyst Intern', 'business-analyst-intern-kite-retail-12013'),
    ],
  ),
  _Seed(
    id: 505,
    name: 'Playverse',
    slug: 'playverse',
    industry: 'Gaming',
    city: 'Hyderabad',
    rating: 4.2,
    reviews: 190,
    type: 'PRODUCT',
    employees: '201–500',
    founded: 2017,
    verified: true,
    about:
        'Playverse creates delightful games played by millions. We blend art, engineering, and player research to make moments people remember.',
    openings: [
      ('Android Engineer', 'android-engineer-playverse-12006'),
      ('UX Researcher (Contract)', 'ux-researcher-playverse-12012'),
    ],
  ),
  _Seed(
    id: 506,
    name: 'Cloudspur',
    slug: 'cloudspur',
    industry: 'Software',
    city: 'Bengaluru',
    rating: 4.5,
    reviews: 95,
    type: 'STARTUP',
    employees: '11–50',
    founded: 2021,
    verified: true,
    about:
        'Cloudspur keeps high-scale platforms fast, reliable, and cheap to run. We are a remote-first infrastructure team.',
    openings: [('DevOps Engineer', 'devops-engineer-cloudspur-12007')],
  ),
  _Seed(
    id: 507,
    name: 'Zesta Foods',
    slug: 'zesta-foods',
    industry: 'FMCG',
    city: 'Delhi',
    rating: 3.8,
    reviews: 260,
    type: 'PRIVATE',
    employees: '1000–5000',
    founded: 2003,
    verified: false,
    about:
        'Zesta Foods is a beloved Indian food brand growing across digital and offline channels, one delicious product at a time.',
    openings: [('Marketing Manager', 'marketing-manager-zesta-foods-12008')],
  ),
  _Seed(
    id: 508,
    name: 'BrightHomes',
    slug: 'brighthomes',
    industry: 'Real Estate',
    city: 'Mumbai',
    rating: 3.5,
    reviews: 120,
    type: 'PRIVATE',
    employees: '201–500',
    founded: 2011,
    verified: false,
    about:
        'BrightHomes helps families find their next home with honesty and care, across India\'s fastest-growing cities.',
    openings: [('Sales Executive', 'sales-executive-brighthomes-12005')],
  ),
];

CompanySummary _toSummary(_Seed s) => CompanySummary(
  id: s.id,
  name: s.name,
  slug: s.slug,
  handle: s.handle,
  industryName: s.industry,
  hqCityName: s.city,
  averageRating: s.rating,
  reviewCount: s.reviews,
  openRolesCount: s.openRoles,
);

CompanyProfile _toProfile(_Seed s) {
  final related = _seeds
      .where((e) => e.industry == s.industry && e.id != s.id)
      .take(5)
      .map(
        (e) => RelatedCompany(
          id: e.id,
          slug: e.slug,
          name: e.name,
          averageRating: e.rating,
          openRoles: e.openRoles,
        ),
      )
      .toList();

  return CompanyProfile(
    id: s.id,
    name: s.name,
    slug: s.slug,
    handle: s.handle,
    description: s.about,
    websiteUrl: 'https://${s.slug}.example.com',
    companyType: s.type,
    industryName: s.industry,
    hqCityName: s.city,
    employeeCount: s.employees,
    foundedYear: s.founded,
    averageRating: s.rating,
    reviewCount: s.reviews,
    activeJobs: s.openRoles,
    isVerified: s.verified,
    highlights: [
      const CompanyHighlight(
        heading: 'Culture',
        body:
            'A collaborative, low-ego team that values ownership and clear communication. We keep meetings light and focus on impact.',
      ),
      const CompanyHighlight(
        heading: 'Growth & learning',
        body:
            'Real responsibility from day one, a learning budget, and mentorship from people who care about helping you level up.',
      ),
    ],
    openings: [
      for (var i = 0; i < s.openings.length; i++)
        CompanyOpening(
          id: s.id * 10 + i,
          title: s.openings[i].$1,
          canonicalSlug: s.openings[i].$2,
          primaryCityName: s.city,
          postedAt: DateTime.now().subtract(Duration(days: 2 + i * 3)),
        ),
    ],
    reviews: [
      CompanyReview(
        id: s.id * 100 + 1,
        rating: s.rating.round().clamp(1, 5),
        title: 'Great place to grow',
        body:
            'Supportive managers, interesting problems, and a healthy work-life balance. Learned a lot in my first year here.',
        isVerified: true,
        createdAt: DateTime.now().subtract(const Duration(days: 18)),
        authorName: 'Verified employee',
      ),
      CompanyReview(
        id: s.id * 100 + 2,
        rating: (s.rating.round() - 1).clamp(1, 5),
        title: 'Solid, with room to improve',
        body:
            'Good team and product. Processes are still maturing, but leadership listens and things keep getting better.',
        createdAt: DateTime.now().subtract(const Duration(days: 40)),
      ),
    ],
    relatedCompanies: related,
  );
}

abstract final class CompaniesMock {
  static Future<CompaniesPage> list({
    String? category,
    String? sort,
    int page = 1,
  }) async {
    await Future.delayed(const Duration(milliseconds: 350));
    var list = _seeds.toList();
    if (category != null && category.isNotEmpty) {
      final c = category.toLowerCase();
      list = list.where((s) => s.slug == c || s.industry.toLowerCase() == c).toList();
    }
    switch (sort) {
      case 'name':
        list.sort((a, b) => a.name.compareTo(b.name));
        break;
      case 'reviews':
        list.sort((a, b) => b.reviews.compareTo(a.reviews));
        break;
      default: // rating
        list.sort((a, b) => b.rating.compareTo(a.rating));
    }
    const pageSize = 20;
    final total = list.length;
    final start = (page - 1) * pageSize;
    final hits = start >= total
        ? <CompanySummary>[]
        : list
              .sublist(start, (start + pageSize).clamp(0, total))
              .map(_toSummary)
              .toList();
    return CompaniesPage(hits: hits, total: total, page: page, pageSize: pageSize);
  }

  static Future<CompanyProfile?> profile(String handle) async {
    await Future.delayed(const Duration(milliseconds: 300));
    // handle is "<slug>-overview-<id>"; match by slug so it's robust even when
    // the caller's id differs from the mock company id (e.g. coming from a job).
    final slug = handle.contains('-overview-')
        ? handle.split('-overview-').first
        : handle;
    for (final s in _seeds) {
      if (s.handle == handle || s.slug == slug) return _toProfile(s);
    }
    return null;
  }
}
