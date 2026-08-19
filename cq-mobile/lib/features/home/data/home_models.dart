import '../../career_advice/data/article_models.dart';

// Home-feed model, shaped to the agreed GET /home composite contract. Reuses
// ArticleSummary for recent articles. fromJson maps the live response; the mock
// builds the same shape from the other features' sample data.

class HomeCounts {
  const HomeCounts({
    required this.activeJobs,
    required this.companies,
    required this.recruiters,
  });
  final int activeJobs;
  final int companies;
  final int recruiters;

  factory HomeCounts.fromJson(Map<String, dynamic> j) => HomeCounts(
    activeJobs: (j['activeJobs'] as num?)?.toInt() ?? 0,
    companies: (j['companies'] as num?)?.toInt() ?? 0,
    // Backend renamed the spec's `hiringTeams` to `recruiters`.
    recruiters: (j['recruiters'] as num?)?.toInt() ??
        (j['hiringTeams'] as num?)?.toInt() ??
        0,
  );
}

class HomeJob {
  const HomeJob({
    required this.canonicalSlug,
    required this.title,
    required this.companyName,
    this.postedAt,
    this.companyLogoUrl,
    this.cityName,
    this.salaryMinPaise,
    this.salaryMaxPaise,
    this.workMode,
  });

  final String canonicalSlug;
  final String title;
  final String companyName;
  final DateTime? postedAt;
  final String? companyLogoUrl;
  final String? cityName;
  final int? salaryMinPaise;
  final int? salaryMaxPaise;
  final String? workMode;

  factory HomeJob.fromJson(Map<String, dynamic> j) => HomeJob(
    canonicalSlug: j['canonicalSlug'] as String? ?? '',
    title: j['title'] as String? ?? '',
    companyName: j['companyName'] as String? ?? '',
    postedAt: DateTime.tryParse(j['postedAt'] as String? ?? ''),
    companyLogoUrl: j['companyLogoUrl'] as String?,
    cityName: j['cityName'] as String?,
    salaryMinPaise: (j['salaryMinPaise'] as num?)?.toInt(),
    salaryMaxPaise: (j['salaryMaxPaise'] as num?)?.toInt(),
    workMode: j['workMode'] as String?,
  );
}

class HomeCompany {
  const HomeCompany({
    required this.id,
    required this.slug,
    required this.name,
    this.logoUrl,
    this.industryName,
    this.hqCityName,
    this.averageRating,
    this.reviewCount = 0,
    this.openingsCount = 0,
  });

  final int id;
  final String slug;
  final String name;
  final String? logoUrl;
  final String? industryName;
  final String? hqCityName;
  final double? averageRating;
  final int reviewCount;
  final int openingsCount;

  String get handle => '$slug-overview-$id';

  factory HomeCompany.fromJson(Map<String, dynamic> j) => HomeCompany(
    id: (j['id'] as num?)?.toInt() ?? 0,
    slug: j['slug'] as String? ?? '',
    name: j['name'] as String? ?? '',
    logoUrl: j['logoUrl'] as String?,
    industryName: j['industryName'] as String?,
    hqCityName: j['hqCityName'] as String?,
    averageRating: (j['averageRating'] as num?)?.toDouble(),
    reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
    openingsCount: (j['openingsCount'] as num?)?.toInt() ??
        (j['openRolesCount'] as num?)?.toInt() ??
        0,
  );
}

/// How a home facet chip should search when tapped.
///
/// This distinction is load-bearing. A role chip is a *keyword* — "Designer"
/// really does appear in job titles. A city, skill or industry is a *facet*:
/// "Rajkot" appears in no job title, so searching it as text returned 0 results
/// while the chip itself advertised 225 jobs. Facet chips must send the slug to
/// the matching filter param instead.
enum HomeTaxoKind { role, city, skill, industry }

class HomeTaxo {
  const HomeTaxo({
    required this.label,
    required this.query,
    // Defaults to `role` (plain keyword search) so the offline sample feed,
    // which carries no slugs, keeps behaving exactly as it did.
    this.kind = HomeTaxoKind.role,
    this.slug = '',
    this.jobCount = 0,
  });

  final String label;

  /// The keyword to search, for [HomeTaxoKind.role] only.
  final String query;

  /// The facet slug, for everything else.
  final String slug;
  final HomeTaxoKind kind;
  final int jobCount;

  bool get isRole => kind == HomeTaxoKind.role;
}

class HomeFeed {
  const HomeFeed({
    required this.counts,
    this.featuredJobs = const [],
    this.featuredCompanies = const [],
    this.roles = const [],
    this.cities = const [],
    this.industries = const [],
    this.topSkills = const [],
    this.recentArticles = const [],
  });

  final HomeCounts counts;
  final List<HomeJob> featuredJobs;
  final List<HomeCompany> featuredCompanies;
  final List<HomeTaxo> roles;
  final List<HomeTaxo> cities;
  final List<HomeTaxo> industries;
  final List<HomeTaxo> topSkills;
  final List<ArticleSummary> recentArticles;

  factory HomeFeed.fromJson(Map<String, dynamic> j) {
    // Accept the live contract keys first, with the old spec keys as fallback.
    List<Map<String, dynamic>> raw(List<String> keys) {
      for (final k in keys) {
        final v = j[k];
        if (v is List) {
          return v.whereType<Map>().map((m) => m.cast<String, dynamic>()).toList();
        }
      }
      return const [];
    }

    List<T> list<T>(List<String> keys, T Function(Map<String, dynamic>) f) =>
        raw(keys).map(f).toList();

    // topRoles carry {label, query}; cities/industries/skills carry {name, slug}.
    // The slug was previously parsed and thrown away, which is what made every
    // city chip search its own name as free text and come back empty.
    List<HomeTaxo> taxo(List<String> keys, {required HomeTaxoKind kind}) =>
        raw(keys).map((mm) {
          final label = (mm['label'] ?? mm['name'] ?? '') as String;
          return HomeTaxo(
            label: label,
            kind: kind,
            query: mm['query'] as String? ?? label,
            slug: mm['slug'] as String? ?? '',
            jobCount: (mm['jobCount'] as num?)?.toInt() ?? 0,
          );
        }).toList();

    return HomeFeed(
      counts: HomeCounts.fromJson(
        (j['counts'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
      featuredJobs: list(['latestJobs', 'featuredJobs'], HomeJob.fromJson),
      featuredCompanies: list(['featuredCompanies'], HomeCompany.fromJson),
      roles: taxo(['topRoles', 'roles'], kind: HomeTaxoKind.role),
      cities: taxo(['popularCities', 'cities'], kind: HomeTaxoKind.city),
      industries: taxo(['topIndustries', 'industries'], kind: HomeTaxoKind.industry),
      topSkills: taxo(['popularSkills', 'topSkills'], kind: HomeTaxoKind.skill),
      recentArticles: list(['recentArticles'], ArticleSummary.fromJson),
    );
  }
}
