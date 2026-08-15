// Job models, shaped to the agreed public API contract (GET /jobs,
// GET /jobs/:slug). Every field has a fromJson so the switch from static
// data to the live endpoint is just flipping AppConfig.useMockData — the
// UI never changes.

class JobCompany {
  const JobCompany({
    required this.id,
    required this.name,
    required this.slug,
    this.logoUrl,
    this.websiteUrl,
  });

  final int id;
  final String name;
  final String slug;
  final String? logoUrl;
  final String? websiteUrl;

  factory JobCompany.fromJson(Map<String, dynamic> j) => JobCompany(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    slug: j['slug'] as String? ?? '',
    logoUrl: j['logoUrl'] as String?,
    websiteUrl: j['websiteUrl'] as String?,
  );
}

class JobSkill {
  const JobSkill({required this.id, required this.slug, required this.name});
  final int id;
  final String slug;
  final String name;

  factory JobSkill.fromJson(Map<String, dynamic> j) => JobSkill(
    id: (j['id'] as num?)?.toInt() ?? 0,
    slug: j['slug'] as String? ?? '',
    name: j['name'] as String? ?? '',
  );
}

class JobIndustry {
  const JobIndustry({required this.slug, required this.name});
  final String slug;
  final String name;

  factory JobIndustry.fromJson(Map<String, dynamic> j) =>
      JobIndustry(slug: j['slug'] as String? ?? '', name: j['name'] as String? ?? '');
}

/// Today's application allowance (`GET /me/applications/quota` — note: NO `/v1`
/// prefix, the applications controller is version-neutral).
///
/// Two traps live in this payload, both handled by [remaining]'s callers rather
/// than here:
///  * `unlimited: true` forces `count: 0` server-side — it is a literal, not the
///    user's real usage — so any number must be suppressed when unlimited.
///  * `count` degrades to 0 if the server's Redis is unavailable, so this is a
///    hint only. The server's 429 remains the sole real enforcement.
class ApplyQuota {
  const ApplyQuota({
    required this.count,
    required this.limit,
    this.unlimited = false,
    this.upgradeAvailable = false,
  });

  final int count;
  final int limit;
  final bool unlimited;
  final bool upgradeAvailable;

  int get remaining => (limit - count).clamp(0, limit);

  factory ApplyQuota.fromJson(Map<String, dynamic> j) => ApplyQuota(
    count: (j['count'] as num?)?.toInt() ?? 0,
    // Never defaulted to a hardcoded 10: the limit is environment-configurable
    // server-side, so a guess here would silently disagree with staging.
    limit: (j['limit'] as num?)?.toInt() ?? 0,
    unlimited: j['unlimited'] as bool? ?? false,
    upgradeAvailable: j['upgradeAvailable'] as bool? ?? false,
  );
}

/// A job as it appears in the search results list (`GET /jobs` hit). Salary is
/// paise, experience is months, `postedAt` is a timestamp. `isSaved`/`isApplied`
/// are the bulk per-user markers the backend is adding to the list response.
class JobSummary {
  const JobSummary({
    required this.id,
    required this.title,
    required this.canonicalSlug,
    required this.company,
    required this.postedAt,
    this.city,
    this.citySlug,
    this.salaryMin,
    this.salaryMax,
    this.minExperienceMonths,
    this.maxExperienceMonths,
    this.skills = const [],
    this.shortDescription,
    this.isSaved = false,
    this.isApplied = false,
  });

  final int id;
  final String title;
  final String canonicalSlug;
  final JobCompany company;
  final DateTime postedAt;
  final String? city;
  final String? citySlug;
  final int? salaryMin;
  final int? salaryMax;
  final int? minExperienceMonths;
  final int? maxExperienceMonths;
  final List<String> skills;
  final String? shortDescription;
  final bool isSaved;
  final bool isApplied;

  factory JobSummary.fromJson(Map<String, dynamic> j) => JobSummary(
    id: (j['id'] as num?)?.toInt() ?? 0,
    title: j['title'] as String? ?? '',
    canonicalSlug: j['canonicalSlug'] as String? ?? '',
    company: JobCompany.fromJson(
      (j['company'] as Map?)?.cast<String, dynamic>() ?? const {},
    ),
    postedAt: DateTime.tryParse(j['postedAt'] as String? ?? '') ?? DateTime.now(),
    city: j['city'] as String?,
    citySlug: j['citySlug'] as String?,
    salaryMin: (j['salaryMin'] as num?)?.toInt(),
    salaryMax: (j['salaryMax'] as num?)?.toInt(),
    minExperienceMonths: (j['minExperienceMonths'] as num?)?.toInt(),
    maxExperienceMonths: (j['maxExperienceMonths'] as num?)?.toInt(),
    skills: ((j['skills'] as List?) ?? const []).whereType<String>().toList(),
    shortDescription: j['shortDescription'] as String?,
    isSaved: j['isSaved'] as bool? ?? false,
    isApplied: j['isApplied'] as bool? ?? false,
  );

  JobSummary copyWith({bool? isSaved, bool? isApplied}) => JobSummary(
    id: id,
    title: title,
    canonicalSlug: canonicalSlug,
    company: company,
    postedAt: postedAt,
    city: city,
    citySlug: citySlug,
    salaryMin: salaryMin,
    salaryMax: salaryMax,
    minExperienceMonths: minExperienceMonths,
    maxExperienceMonths: maxExperienceMonths,
    skills: skills,
    shortDescription: shortDescription,
    isSaved: isSaved ?? this.isSaved,
    isApplied: isApplied ?? this.isApplied,
  );
}

/// One page of search results (`{ hits, total, page, pageSize }`).
class JobsPage {
  const JobsPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<JobSummary> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory JobsPage.fromJson(Map<String, dynamic> j) => JobsPage(
    hits: ((j['hits'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => JobSummary.fromJson(m.cast<String, dynamic>()))
        .toList(),
    total: (j['total'] as num?)?.toInt() ?? 0,
    page: (j['page'] as num?)?.toInt() ?? 1,
    pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
  );
}

/// Per-user saved/applied markers for a batch of jobs (`POST /v1/me/job-state`).
class JobState {
  const JobState({this.saved = const {}, this.applied = const {}});

  final Set<int> saved;
  final Map<int, String> applied; // jobId -> current application status

  factory JobState.fromJson(Map<String, dynamic> j) {
    final saved = ((j['saved'] as List?) ?? const [])
        .whereType<num>()
        .map((n) => n.toInt())
        .toSet();
    final applied = <int, String>{};
    ((j['applied'] as Map?)?.cast<String, dynamic>() ?? const {}).forEach((
      k,
      v,
    ) {
      final id = int.tryParse(k);
      if (id != null && v is String) applied[id] = v;
    });
    return JobState(saved: saved, applied: applied);
  }
}

/// The full job (`GET /jobs/:slug`). Salary is paise, experience is years here
/// (the detail resource is Prisma-shaped). `body` prefers the rich markdown.
class JobDetail {
  const JobDetail({
    required this.id,
    required this.canonicalSlug,
    required this.title,
    required this.description,
    required this.status,
    required this.postedAt,
    required this.company,
    this.descriptionMarkdown,
    this.shortDescription,
    this.employmentType,
    this.workMode,
    this.expiresAt,
    this.salaryMinPaise,
    this.salaryMaxPaise,
    this.experienceMinYears,
    this.experienceMaxYears,
    this.cities = const [],
    this.skills = const [],
    this.industry,
    this.isSaved = false,
    this.isApplied = false,
  });

  final int id;
  final String canonicalSlug;
  final String title;
  final String description;
  final String status;
  final DateTime postedAt;
  final JobCompany company;
  final String? descriptionMarkdown;
  final String? shortDescription;
  final String? employmentType;
  final String? workMode;
  final DateTime? expiresAt;
  final int? salaryMinPaise;
  final int? salaryMaxPaise;
  final int? experienceMinYears;
  final int? experienceMaxYears;
  final List<String> cities;
  final List<JobSkill> skills;
  final JobIndustry? industry;
  final bool isSaved;
  final bool isApplied;

  String get body => (descriptionMarkdown != null && descriptionMarkdown!.isNotEmpty)
      ? descriptionMarkdown!
      : description;
  bool get isActive => status == 'ACTIVE';

  factory JobDetail.fromJson(Map<String, dynamic> j) => JobDetail(
    id: (j['id'] as num?)?.toInt() ?? 0,
    canonicalSlug: j['canonicalSlug'] as String? ?? '',
    title: j['title'] as String? ?? '',
    description: j['description'] as String? ?? '',
    status: j['status'] as String? ?? 'ACTIVE',
    postedAt: DateTime.tryParse(j['postedAt'] as String? ?? '') ?? DateTime.now(),
    company: JobCompany.fromJson(
      (j['company'] as Map?)?.cast<String, dynamic>() ?? const {},
    ),
    descriptionMarkdown: j['descriptionMarkdown'] as String?,
    shortDescription: j['shortDescription'] as String?,
    employmentType: j['employmentType'] as String?,
    workMode: j['workMode'] as String?,
    expiresAt: DateTime.tryParse(j['expiresAt'] as String? ?? ''),
    salaryMinPaise: (j['salaryMinPaise'] as num?)?.toInt(),
    salaryMaxPaise: (j['salaryMaxPaise'] as num?)?.toInt(),
    experienceMinYears: (j['experienceMinYears'] as num?)?.toInt(),
    experienceMaxYears: (j['experienceMaxYears'] as num?)?.toInt(),
    cities: ((j['cities'] as List?) ?? const []).whereType<String>().toList(),
    skills: ((j['skills'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => JobSkill.fromJson(m.cast<String, dynamic>()))
        .toList(),
    industry: j['industry'] is Map
        ? JobIndustry.fromJson((j['industry'] as Map).cast<String, dynamic>())
        : null,
    isSaved: j['isSaved'] as bool? ?? false,
    isApplied: j['isApplied'] as bool? ?? false,
  );
}
