/// One education entry from `GET /me/education`. Writable fields mirror the
/// backend `EducationCreateDto` (institute, degree, fieldOfStudy, startYear,
/// endYear [null = currently pursuing], grade).
class EducationItem {
  const EducationItem({
    required this.id,
    required this.institute,
    required this.degree,
    this.fieldOfStudy,
    required this.startYear,
    this.endYear,
    this.grade,
  });

  final int id;
  final String institute;
  final String degree;
  final String? fieldOfStudy;
  final int startYear;

  /// null ⇔ currently pursuing (ongoing).
  final int? endYear;
  final String? grade;

  bool get ongoing => endYear == null;
  String get yearRange => '$startYear – ${endYear ?? 'Present'}';

  factory EducationItem.fromJson(Map<String, dynamic> j) => EducationItem(
    id: (j['id'] as num?)?.toInt() ?? 0,
    institute: j['institute'] as String? ?? '',
    degree: j['degree'] as String? ?? '',
    fieldOfStudy: j['fieldOfStudy'] as String?,
    startYear: (j['startYear'] as num?)?.toInt() ?? 2000,
    endYear: (j['endYear'] as num?)?.toInt(),
    grade: j['grade'] as String?,
  );
}
