import '../../catalogs/data/catalog_models.dart';

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
