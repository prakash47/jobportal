import 'education_models.dart';

// In-memory education for demo/offline mode.
abstract final class EducationMock {
  static final List<EducationItem> _items = [
    const EducationItem(
      id: 1,
      institute: 'Indian Institute of Technology, Bombay',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science',
      startYear: 2016,
      endYear: 2020,
      grade: '8.6 CGPA',
    ),
  ];

  static int _nextId = 2;

  static List<EducationItem> list() {
    final copy = [..._items];
    copy.sort((a, b) => b.startYear.compareTo(a.startYear));
    return copy;
  }

  static EducationItem create(Map<String, dynamic> body) {
    final item = _fromBody(_nextId++, body);
    _items.add(item);
    return item;
  }

  static EducationItem update(int id, Map<String, dynamic> body) {
    final i = _items.indexWhere((e) => e.id == id);
    final updated = _fromBody(id, body);
    if (i >= 0) _items[i] = updated;
    return updated;
  }

  static void delete(int id) => _items.removeWhere((e) => e.id == id);

  static EducationItem _fromBody(int id, Map<String, dynamic> b) => EducationItem(
    id: id,
    institute: b['institute'] as String? ?? '',
    degree: b['degree'] as String? ?? '',
    fieldOfStudy: b['fieldOfStudy'] as String?,
    startYear: (b['startYear'] as num?)?.toInt() ?? 2000,
    endYear: (b['endYear'] as num?)?.toInt(),
    grade: b['grade'] as String?,
  );
}
