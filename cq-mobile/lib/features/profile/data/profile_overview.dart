/// The signed-in seeker's profile, from `GET /me/profile`
/// (`{ user, candidate, educationCount, experienceCount }`). Used by the Profile
/// tab to show a read-only overview + completeness.
class ProfileOverview {
  const ProfileOverview({
    required this.name,
    required this.email,
    required this.emailVerified,
    required this.completeness,
    required this.skillCount,
    required this.educationCount,
    required this.experienceCount,
    this.phone,
    this.workStatus,
    this.lookingFor,
    this.experienceMonths,
    this.currentTitle,
    this.currentCompanyName,
    this.currentCityName,
    this.headline,
    this.expectedSalaryMinPaise,
    this.gender,
  });

  final String name;
  final String email;
  final bool emailVerified;

  /// 0–100 server-computed profile completeness.
  final int completeness;
  final int skillCount;
  final int educationCount;
  final int experienceCount;

  final String? phone;
  final String? workStatus; // FRESHER | EXPERIENCED
  final String? lookingFor; // JOB | INTERNSHIP | BOTH
  final int? experienceMonths;
  final String? currentTitle;
  final String? currentCompanyName;
  final String? currentCityName;
  final String? headline;
  final int? expectedSalaryMinPaise;
  final String? gender;

  factory ProfileOverview.fromJson(Map<String, dynamic> j) {
    final user = (j['user'] as Map?)?.cast<String, dynamic>() ?? const {};
    final c = (j['candidate'] as Map?)?.cast<String, dynamic>() ?? const {};
    final skillIds = (c['skillIds'] as List?) ?? const [];
    return ProfileOverview(
      name: user['name'] as String? ?? '',
      email: user['email'] as String? ?? '',
      emailVerified: user['emailVerified'] as bool? ?? false,
      phone: user['phone'] as String?,
      completeness: (c['profileCompleteness'] as num?)?.toInt() ?? 0,
      skillCount: skillIds.length,
      educationCount: (j['educationCount'] as num?)?.toInt() ?? 0,
      experienceCount: (j['experienceCount'] as num?)?.toInt() ?? 0,
      workStatus: c['workStatus'] as String?,
      lookingFor: c['lookingFor'] as String?,
      experienceMonths: (c['experienceMonths'] as num?)?.toInt(),
      currentTitle: c['currentTitle'] as String?,
      currentCompanyName: c['currentCompanyName'] as String?,
      currentCityName: c['currentCityName'] as String?,
      headline: c['headline'] as String?,
      expectedSalaryMinPaise: (c['expectedSalaryMinPaise'] as num?)?.toInt(),
      gender: c['gender'] as String?,
    );
  }
}
