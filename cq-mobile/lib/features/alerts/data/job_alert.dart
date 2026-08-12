/// A saved job alert from `/me/alerts`. The saved query supports keywords,
/// skills, cities, experience and salary — but skills/cities need a catalogue
/// API the backend doesn't expose, so the app edits **keywords + experience +
/// salary** only (any skills/cities set on the website are preserved untouched).
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

  /// The full saved query (kept as-is so an edit doesn't drop website-set
  /// skill/city filters the app can't render).
  final Map<String, dynamic> query;
  final DateTime? lastSentAt;

  String get keywords => query['q'] as String? ?? '';

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
