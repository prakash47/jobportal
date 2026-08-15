import '../../../core/format/job_format.dart';

/// One work-history entry from `GET /me/experience`. Writable fields mirror the
/// backend `ExperienceCreateDto` (companyName, title, startDate, endDate,
/// isCurrent, description); id/timestamps come back on reads.
class WorkExperienceItem {
  const WorkExperienceItem({
    required this.id,
    required this.companyName,
    required this.title,
    required this.startDate,
    this.endDate,
    this.isCurrent = false,
    this.description,
  });

  final int id;
  final String companyName;
  final String title;
  final DateTime startDate;
  final DateTime? endDate;
  final bool isCurrent;
  final String? description;

  /// "Jan 2022 – Present" / "Mar 2019 – Aug 2021".
  String get dateRangeLabel {
    final start = formatMonthYear(startDate);
    final end = isCurrent
        ? 'Present'
        : (endDate != null ? formatMonthYear(endDate!) : '—');
    return '$start – $end';
  }

  /// Whole months from start to end (or now), rendered "2 yrs 3 mo".
  String get durationLabel {
    final end = (isCurrent || endDate == null) ? DateTime.now() : endDate!;
    var months = (end.year - startDate.year) * 12 + (end.month - startDate.month);
    if (months < 0) months = 0;
    months += 1; // count both endpoints
    final y = months ~/ 12;
    final r = months % 12;
    final parts = <String>[];
    if (y > 0) parts.add('$y yr${y > 1 ? 's' : ''}');
    if (r > 0) parts.add('$r mo');
    return parts.join(' ');
  }

  factory WorkExperienceItem.fromJson(Map<String, dynamic> j) {
    DateTime? parse(Object? v) =>
        v is String ? DateTime.tryParse(v)?.toLocal() : null;
    return WorkExperienceItem(
      id: (j['id'] as num?)?.toInt() ?? 0,
      companyName: j['companyName'] as String? ?? '',
      title: j['title'] as String? ?? '',
      startDate: parse(j['startDate']) ?? DateTime.now(),
      endDate: parse(j['endDate']),
      isCurrent: j['isCurrent'] as bool? ?? false,
      description: j['description'] as String?,
    );
  }
}
