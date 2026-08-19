// Company models, shaped to the agreed public API contract (GET /companies,
// GET /companies/:handle). fromJson on every type so the static→live switch is
// just flipping AppConfig.useMockData.

const _companyTypeLabels = <String, String>{
  'INDIAN_MNC': 'Indian MNC',
  'FOREIGN_MNC': 'Foreign MNC',
  'STARTUP': 'Startup',
  'UNICORN': 'Unicorn',
  'PRODUCT': 'Product',
  'SERVICE': 'Service-based',
  'GOVERNMENT': 'Government',
  'PUBLIC': 'Public',
  'PRIVATE': 'Private',
  'NGO': 'NGO / Non-profit',
};

String companyTypeLabel(String? v) {
  if (v == null || v.isEmpty) return '';
  return _companyTypeLabels[v] ??
      v
          .split('_')
          .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
          .join(' ');
}

class CompanySummary {
  const CompanySummary({
    required this.id,
    required this.name,
    required this.slug,
    required this.handle,
    this.logoUrl,
    this.industryName,
    this.hqCityName,
    this.averageRating,
    this.reviewCount = 0,
    this.openRolesCount = 0,
  });

  final int id;
  final String name;
  final String slug;
  final String handle;
  final String? logoUrl;
  final String? industryName;
  final String? hqCityName;
  final double? averageRating;
  final int reviewCount;
  final int openRolesCount;

  factory CompanySummary.fromJson(Map<String, dynamic> j) => CompanySummary(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    slug: j['slug'] as String? ?? '',
    handle: j['handle'] as String? ?? '',
    logoUrl: j['logoUrl'] as String?,
    industryName: j['industryName'] as String?,
    hqCityName: j['hqCityName'] as String?,
    averageRating: (j['averageRating'] as num?)?.toDouble(),
    reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
    // Website's companies-list card uses `openingsCount`; accept either key.
    openRolesCount: (j['openingsCount'] as num?)?.toInt() ??
        (j['openRolesCount'] as num?)?.toInt() ??
        0,
  );
}

class CompaniesPage {
  const CompaniesPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<CompanySummary> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory CompaniesPage.fromJson(Map<String, dynamic> j) => CompaniesPage(
    hits: ((j['hits'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => CompanySummary.fromJson(m.cast<String, dynamic>()))
        .toList(),
    total: (j['total'] as num?)?.toInt() ?? 0,
    page: (j['page'] as num?)?.toInt() ?? 1,
    pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
  );
}

class CompanyHighlight {
  const CompanyHighlight({required this.heading, required this.body, this.imageUrl});
  final String heading;
  final String body;
  final String? imageUrl;

  factory CompanyHighlight.fromJson(Map<String, dynamic> j) => CompanyHighlight(
    heading: j['heading'] as String? ?? '',
    body: j['body'] as String? ?? '',
    imageUrl: j['imageUrl'] as String?,
  );
}

class CompanyOpening {
  const CompanyOpening({
    required this.id,
    required this.title,
    required this.canonicalSlug,
    this.primaryCityName,
    this.postedAt,
  });
  final int id;
  final String title;
  final String canonicalSlug;
  final String? primaryCityName;
  final DateTime? postedAt;

  factory CompanyOpening.fromJson(Map<String, dynamic> j) => CompanyOpening(
    id: (j['id'] as num?)?.toInt() ?? 0,
    title: j['title'] as String? ?? '',
    canonicalSlug: j['canonicalSlug'] as String? ?? '',
    primaryCityName: j['primaryCityName'] as String?,
    postedAt: DateTime.tryParse(j['postedAt'] as String? ?? ''),
  );
}

class CompanyReview {
  const CompanyReview({
    required this.id,
    required this.rating,
    this.title,
    required this.body,
    this.isVerified = false,
    required this.createdAt,
    this.authorName,
  });
  final int id;
  final int rating;
  final String? title;
  final String body;
  final bool isVerified;
  final DateTime createdAt;
  final String? authorName;

  factory CompanyReview.fromJson(Map<String, dynamic> j) => CompanyReview(
    id: (j['id'] as num?)?.toInt() ?? 0,
    rating: (j['rating'] as num?)?.toInt() ?? 0,
    title: j['title'] as String?,
    body: j['body'] as String? ?? '',
    isVerified: j['isVerified'] as bool? ?? false,
    createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
    authorName: j['authorName'] as String?,
  );
}

class RelatedCompany {
  const RelatedCompany({
    required this.id,
    required this.slug,
    required this.name,
    this.logoUrl,
    this.averageRating,
    this.openRoles = 0,
    this.serverHandle,
  });
  final int id;
  final String slug;
  final String name;
  final String? logoUrl;
  final double? averageRating;
  final int openRoles;

  /// The handle as the API sends it, when it does. Preferred over the locally
  /// derived one so the app isn't the second owner of the URL rule — if the
  /// website's handle format ever changes, this follows it for free.
  final String? serverHandle;

  String get handle => (serverHandle?.isNotEmpty ?? false)
      ? serverHandle!
      : '$slug-overview-$id';

  factory RelatedCompany.fromJson(Map<String, dynamic> j) => RelatedCompany(
    id: (j['id'] as num?)?.toInt() ?? 0,
    slug: j['slug'] as String? ?? '',
    name: j['name'] as String? ?? '',
    logoUrl: j['logoUrl'] as String?,
    averageRating: (j['averageRating'] as num?)?.toDouble(),
    openRoles: (j['openRoles'] as num?)?.toInt() ?? 0,
    serverHandle: j['handle'] as String?,
  );
}

class CompanyProfile {
  const CompanyProfile({
    required this.id,
    required this.name,
    required this.slug,
    required this.handle,
    this.logoUrl,
    this.description,
    this.websiteUrl,
    this.companyType,
    this.industryName,
    this.hqCityName,
    this.employeeCount,
    this.foundedYear,
    this.averageRating,
    this.reviewCount = 0,
    this.activeJobs = 0,
    this.isVerified = false,
    this.highlights = const [],
    this.openings = const [],
    this.reviews = const [],
    this.relatedCompanies = const [],
  });

  final int id;
  final String name;
  final String slug;
  final String handle;
  final String? logoUrl;
  final String? description;
  final String? websiteUrl;
  final String? companyType;
  final String? industryName;
  final String? hqCityName;
  final String? employeeCount;
  final int? foundedYear;
  final double? averageRating;
  final int reviewCount;
  final int activeJobs;
  final bool isVerified;
  final List<CompanyHighlight> highlights;
  final List<CompanyOpening> openings;
  final List<CompanyReview> reviews;
  final List<RelatedCompany> relatedCompanies;

  factory CompanyProfile.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((j[key] as List?) ?? const [])
            .whereType<Map>()
            .map((m) => f(m.cast<String, dynamic>()))
            .toList();
    return CompanyProfile(
      id: (j['id'] as num?)?.toInt() ?? 0,
      name: j['name'] as String? ?? '',
      slug: j['slug'] as String? ?? '',
      handle: j['handle'] as String? ?? '',
      logoUrl: j['logoUrl'] as String?,
      description: j['description'] as String?,
      websiteUrl: j['websiteUrl'] as String?,
      companyType: j['companyType'] as String?,
      industryName: j['industryName'] as String?,
      hqCityName: j['hqCityName'] as String?,
      employeeCount: j['employeeCount'] as String?,
      foundedYear: (j['foundedYear'] as num?)?.toInt(),
      averageRating: (j['averageRating'] as num?)?.toDouble(),
      reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
      activeJobs: (j['activeJobs'] as num?)?.toInt() ?? 0,
      isVerified: j['isVerified'] as bool? ?? false,
      highlights: list('highlights', CompanyHighlight.fromJson),
      openings: list('openings', CompanyOpening.fromJson),
      reviews: list('reviews', CompanyReview.fromJson),
      relatedCompanies: list('relatedCompanies', RelatedCompany.fromJson),
    );
  }
}
