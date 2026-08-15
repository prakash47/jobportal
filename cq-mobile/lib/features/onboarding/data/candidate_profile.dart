/// The slice of `GET /me/profile` the onboarding wizard needs to prefill its
/// fields. A brand-new account has these mostly null; returning users see their
/// saved values. Parsed from `{ user: {...}, candidate: {...} }`.
class CandidateProfile {
  const CandidateProfile({
    this.name,
    this.phone,
    this.workStatus,
    this.lookingFor,
    this.experienceMonths,
    this.currentSalaryPaise,
    this.currentCompanyName,
    this.currentTitle,
    this.currentCityName,
    this.noticePeriodDays,
    this.headline,
    this.expectedSalaryMinPaise,
    this.gender,
    this.summary,
    this.industryId,
    this.expectedSalaryMaxPaise,
    this.preferredCityIds = const [],
    this.skillIds = const [],
  });

  final String? name;
  final String? phone;

  /// 'FRESHER' | 'EXPERIENCED'
  final String? workStatus;

  /// 'JOB' | 'INTERNSHIP' | 'BOTH'
  final String? lookingFor;
  final int? experienceMonths;
  final int? currentSalaryPaise;
  final String? currentCompanyName;
  final String? currentTitle;
  final String? currentCityName;
  final int? noticePeriodDays;
  final String? headline;
  final int? expectedSalaryMinPaise;

  /// 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY'
  final String? gender;

  final String? summary;
  final int? industryId;
  final int? expectedSalaryMaxPaise;
  final List<int> preferredCityIds;

  /// The candidate's skills as bare catalogue ids — resolve them through
  /// `CatalogsRepository.resolve` to get names/slugs.
  final List<int> skillIds;

  factory CandidateProfile.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map?)?.cast<String, dynamic>() ?? const {};
    final c = (json['candidate'] as Map?)?.cast<String, dynamic>() ?? const {};
    return CandidateProfile(
      name: user['name'] as String?,
      phone: user['phone'] as String?,
      workStatus: c['workStatus'] as String?,
      lookingFor: c['lookingFor'] as String?,
      experienceMonths: (c['experienceMonths'] as num?)?.toInt(),
      currentSalaryPaise: (c['currentSalaryPaise'] as num?)?.toInt(),
      currentCompanyName: c['currentCompanyName'] as String?,
      currentTitle: c['currentTitle'] as String?,
      currentCityName: c['currentCityName'] as String?,
      noticePeriodDays: (c['noticePeriodDays'] as num?)?.toInt(),
      headline: c['headline'] as String?,
      expectedSalaryMinPaise: (c['expectedSalaryMinPaise'] as num?)?.toInt(),
      gender: c['gender'] as String?,
      summary: c['summary'] as String?,
      industryId: (c['industryId'] as num?)?.toInt(),
      expectedSalaryMaxPaise: (c['expectedSalaryMaxPaise'] as num?)?.toInt(),
      preferredCityIds: ((c['preferredCityIds'] as List?) ?? const [])
          .whereType<num>()
          .map((n) => n.toInt())
          .toList(),
      skillIds: ((c['skillIds'] as List?) ?? const [])
          .whereType<num>()
          .map((n) => n.toInt())
          .toList(),
    );
  }
}
