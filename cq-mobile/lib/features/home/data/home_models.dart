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
    required this.postedAt,
    this.companyLogoUrl,
    this.cityName,
    this.salaryMinPaise,
    this.salaryMaxPaise,
    this.workMode,
  });

  final String canonicalSlug;
  final String title;
  final String companyName;
  final DateTime postedAt;
  final String? companyLogoUrl;
  final String? cityName;
  final int? salaryMinPaise;
  final int? salaryMaxPaise;
  final String? workMode;

  factory HomeJob.fromJson(Map<String, dynamic> j) => HomeJob(
    canonicalSlug: j['canonicalSlug'] as String? ?? '',
    title: j['title'] as String? ?? '',
    companyName: j['companyName'] as String? ?? '',
    postedAt: DateTime.tryParse(j['postedAt'] as String? ?? '') ?? DateTime.now(),
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

/// A browse facet — role / city / industry / skill. [query] is what to feed the
/// search screen; [label] is what to show.
class HomeTaxo {
  const HomeTaxo({required this.label, required this.query, this.jobCount = 0});
  final String label;
  final String query;
  final int jobCount;
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
    List<HomeTaxo> taxo(List<String> keys, {required bool isRole}) =>
        raw(keys).map((mm) {
          final label = (mm['label'] ?? mm['name'] ?? '') as String;
          final query = isRole
              ? (mm['query'] as String? ?? label)
              : (mm['name'] as String? ?? label);
          return HomeTaxo(
            label: label,
            query: query,
            jobCount: (mm['jobCount'] as num?)?.toInt() ?? 0,
          );
        }).toList();

    return HomeFeed(
      counts: HomeCounts.fromJson(
        (j['counts'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
      featuredJobs: list(['latestJobs', 'featuredJobs'], HomeJob.fromJson),
      featuredCompanies: list(['featuredCompanies'], HomeCompany.fromJson),
      roles: taxo(['topRoles', 'roles'], isRole: true),
      cities: taxo(['popularCities', 'cities'], isRole: false),
      industries: taxo(['topIndustries', 'industries'], isRole: false),
      topSkills: taxo(['popularSkills', 'topSkills'], isRole: false),
      recentArticles: list(['recentArticles'], ArticleSummary.fromJson),
    );
  }
}
