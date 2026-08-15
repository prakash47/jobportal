/// A saved job alert from `/me/alerts`. The saved query supports keywords,
/// skills, cities, experience and salary — all editable in the app. The full
/// [query] map is preserved on edit so nothing set elsewhere is dropped.
class JobAlert {
  const JobAlert({
    required this.id,
    required this.name,
    required this.frequency,
    required this.isActive,
    required this.query,
    this.lastSentAt,
  });

  final int id;
  final String name;

  /// 'instant' | 'daily' | 'weekly'
  final String frequency;
  final bool isActive;

  /// The full saved query, kept as-is and merged over on edit.
  final Map<String, dynamic> query;
  final DateTime? lastSentAt;

  String get keywords => query['q'] as String? ?? '';

  List<String> get skillSlugs =>
      ((query['skillSlugs'] as List?) ?? const []).whereType<String>().toList();

  List<String> get citySlugs =>
      ((query['citySlugs'] as List?) ?? const []).whereType<String>().toList();

  int? get minExperienceMonths => (query['minExperienceMonths'] as num?)?.toInt();
  int? get maxExperienceMonths => (query['maxExperienceMonths'] as num?)?.toInt();

  /// Minimum salary in paise (1 LPA = 10,000,000 paise), matching the SRP.
  int? get salaryMinPaise => (query['salaryMin'] as num?)?.toInt();

  factory JobAlert.fromJson(Map<String, dynamic> j) {
    return JobAlert(
      id: (j['id'] as num?)?.toInt() ?? 0,
      name: j['name'] as String? ?? 'Alert',
      frequency: j['frequency'] as String? ?? 'daily',
      isActive: j['isActive'] as bool? ?? true,
      query: (j['query'] as Map?)?.cast<String, dynamic>() ?? const {},
      lastSentAt: DateTime.tryParse(j['lastSentAt'] as String? ?? ''),
    );
  }
}
