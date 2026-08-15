import '../../catalogs/data/catalog_models.dart';

/// One active facet plus the filter set that results from removing it — the
/// data behind a removable chip above the search results.
class ActiveFilter {
  const ActiveFilter(this.label, this.without);
  final String label;
  final JobFilters without;
}

// Chip labels. `workModes` holds the frozen URL spellings (on-site / hybrid /
// remote), NOT the WorkMode enum, so this cannot reuse `workModeLabels` from
// job_format — that map is keyed by the enum spellings.
const _workModeLabels = <String, String>{
  'on-site': 'On-site',
  'hybrid': 'Hybrid',
  'remote': 'Remote',
};

const _employmentLabels = <String, String>{
  'FULL_TIME': 'Full-time',
  'PART_TIME': 'Part-time',
  'CONTRACTOR': 'Contract',
  'INTERN': 'Internship',
};

const _postedLabels = <int, String>{
  1: 'Last 24 hours',
  7: 'Last 7 days',
  30: 'Last 30 days',
};

// The full job-search filter set — mirrors the website's SRP facets and the
// /v1/jobs query params. Salary is entered in LPA and sent as paise; `mode`
// uses the frozen lowercase-hyphen spelling (on-site, not ONSITE).

class JobFilters {
  const JobFilters({
    this.skills = const [],
    this.cities = const [],
    this.industry,
    this.employmentTypes = const {},
    this.workModes = const {},
    this.expMinYears,
    this.expMaxYears,
    this.minSalaryLpa,
    this.postedWithin,
  });

  final List<CatalogItem> skills;
  final List<CatalogItem> cities;
  final CatalogItem? industry;

  /// FULL_TIME | PART_TIME | CONTRACTOR | INTERN
  final Set<String> employmentTypes;

  /// on-site | hybrid | remote (frozen spelling — NOT the enum)
  final Set<String> workModes;

  final int? expMinYears;
  final int? expMaxYears;
  final int? minSalaryLpa;

  /// 1 | 7 | 30
  final int? postedWithin;

  int get activeCount =>
      skills.length +
      cities.length +
      (industry != null ? 1 : 0) +
      employmentTypes.length +
      workModes.length +
      ((expMinYears != null || expMaxYears != null) ? 1 : 0) +
      (minSalaryLpa != null ? 1 : 0) +
      (postedWithin != null ? 1 : 0);

  bool get isEmpty => activeCount == 0;

  /// Copy with individual facets replaced. Nullable facets need an explicit
  /// `clear*` flag, because passing `null` is indistinguishable from "leave it
  /// alone" in a named-parameter copy.
  JobFilters copyWith({
    List<CatalogItem>? skills,
    List<CatalogItem>? cities,
    CatalogItem? industry,
    bool clearIndustry = false,
    Set<String>? employmentTypes,
    Set<String>? workModes,
    int? expMinYears,
    int? expMaxYears,
    bool clearExperience = false,
    int? minSalaryLpa,
    bool clearSalary = false,
    int? postedWithin,
    bool clearPostedWithin = false,
  }) => JobFilters(
    skills: skills ?? this.skills,
    cities: cities ?? this.cities,
    industry: clearIndustry ? null : (industry ?? this.industry),
    employmentTypes: employmentTypes ?? this.employmentTypes,
    workModes: workModes ?? this.workModes,
    expMinYears: clearExperience ? null : (expMinYears ?? this.expMinYears),
    expMaxYears: clearExperience ? null : (expMaxYears ?? this.expMaxYears),
    minSalaryLpa: clearSalary ? null : (minSalaryLpa ?? this.minSalaryLpa),
    postedWithin: clearPostedWithin
        ? null
        : (postedWithin ?? this.postedWithin),
  );

  /// The active facets as removable chips, in the order they read best above
  /// the results. Each chip carries the filter set *without* it, so removing
  /// one facet never disturbs the others.
  ///
  /// Experience is one chip even though it is two fields — a user thinks of
  /// "2–5 yrs" as a single thing they turned on.
  List<ActiveFilter> get active => [
    for (final s in skills)
      ActiveFilter(
        s.name,
        copyWith(skills: skills.where((x) => x.id != s.id).toList()),
      ),
    for (final c in cities)
      ActiveFilter(
        c.name,
        copyWith(cities: cities.where((x) => x.id != c.id).toList()),
      ),
    if (industry != null)
      ActiveFilter(industry!.name, copyWith(clearIndustry: true)),
    for (final e in employmentTypes)
      ActiveFilter(
        _employmentLabels[e] ?? e,
        copyWith(employmentTypes: employmentTypes.where((x) => x != e).toSet()),
      ),
    for (final m in workModes)
      ActiveFilter(
        _workModeLabels[m] ?? m,
        copyWith(workModes: workModes.where((x) => x != m).toSet()),
      ),
    if (expMinYears != null || expMaxYears != null)
      ActiveFilter(_experienceLabel(), copyWith(clearExperience: true)),
    if (minSalaryLpa != null)
      ActiveFilter('$minSalaryLpa+ LPA', copyWith(clearSalary: true)),
    if (postedWithin != null)
      ActiveFilter(
        _postedLabels[postedWithin] ?? 'Last $postedWithin days',
        copyWith(clearPostedWithin: true),
      ),
  ];

  String _experienceLabel() {
    if (expMinYears != null && expMaxYears != null) {
      return '$expMinYears–$expMaxYears yrs';
    }
    if (expMinYears != null) return '$expMinYears+ yrs';
    return 'Up to $expMaxYears yrs';
  }

  /// This search expressed as a job-alert query.
  ///
  /// **Lossy on purpose.** The alert query DTO is `.strict()` and accepts only
  /// `q`, `skillSlugs`, `citySlugs`, `minExperienceMonths`,
  /// `maxExperienceMonths` and `salaryMin` — sending anything else is a 400,
  /// and the alert worker would ignore it regardless. So industry, employment
  /// type, work mode and posted-within cannot be saved into an alert at all;
  /// [unsupportedForAlert] names the ones being dropped so the UI can say so
  /// instead of silently narrowing what the user asked for.
  ///
  /// Note the unit changes: the alert wants experience in MONTHS (this class
  /// holds years) and skills/cities as SLUGS (not catalogue ids).
  Map<String, dynamic> toAlertQuery(String query) => {
    if (query.trim().isNotEmpty) 'q': query.trim(),
    if (skills.isNotEmpty)
      'skillSlugs': skills.take(20).map((s) => s.slug).toList(),
    if (cities.isNotEmpty)
      'citySlugs': cities.take(10).map((c) => c.slug).toList(),
    if (expMinYears != null) 'minExperienceMonths': expMinYears! * 12,
    if (expMaxYears != null) 'maxExperienceMonths': expMaxYears! * 12,
    if (minSalaryLpa != null) 'salaryMin': minSalaryLpa! * 10000000,
  };

  /// Human labels for the active facets an alert cannot carry.
  List<String> get unsupportedForAlert => [
    if (industry != null) 'industry',
    if (employmentTypes.isNotEmpty) 'job type',
    if (workModes.isNotEmpty) 'work mode',
    if (postedWithin != null) 'date posted',
  ];

  Map<String, dynamic> toQuery() => {
    if (skills.isNotEmpty) 'skill': skills.map((s) => s.slug).toList(),
    if (cities.isNotEmpty) 'city': cities.map((c) => c.slug).toList(),
    if (industry != null) 'industry': industry!.slug,
    if (employmentTypes.isNotEmpty) 'emp': employmentTypes.toList(),
    if (workModes.isNotEmpty) 'mode': workModes.toList(),
    if (expMinYears != null) 'expMin': expMinYears,
    if (expMaxYears != null) 'expMax': expMaxYears,
    if (minSalaryLpa != null) 'salaryMin': minSalaryLpa! * 10000000, // LPA → paise
    if (postedWithin != null) 'postedWithin': postedWithin,
  };
}
