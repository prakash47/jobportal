import 'experience_models.dart';

// In-memory work history for demo/offline mode. Starts with sample entries and
// mutates through the same add/edit/delete calls so the manager feels live.
abstract final class ExperienceMock {
  static final List<WorkExperienceItem> _items = [
    WorkExperienceItem(
      id: 1,
      companyName: 'Nimbus Technologies',
      title: 'Senior Flutter Developer',
      startDate: DateTime(2023, 4),
      isCurrent: true,
      description: 'Leading the mobile team; shipped 3 apps on Android and iOS.',
    ),
    WorkExperienceItem(
      id: 2,
      companyName: 'BluePeak Solutions',
      title: 'Mobile Developer',
      startDate: DateTime(2021, 1),
      endDate: DateTime(2023, 3),
      description: 'Built customer-facing apps and internal tooling.',
    ),
  ];

  static int _nextId = 3;

  static List<WorkExperienceItem> list() {
    final copy = [..._items];
    copy.sort((a, b) {
      if (a.isCurrent != b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.startDate.compareTo(a.startDate);
    });
    return copy;
  }

  static WorkExperienceItem create(Map<String, dynamic> body) {
    final item = _fromBody(_nextId++, body);
    _items.add(item);
    return item;
  }

  static WorkExperienceItem update(int id, Map<String, dynamic> body) {
    final i = _items.indexWhere((e) => e.id == id);
    final updated = _fromBody(id, body);
    if (i >= 0) _items[i] = updated;
    return updated;
  }

  static void delete(int id) => _items.removeWhere((e) => e.id == id);

  static WorkExperienceItem _fromBody(int id, Map<String, dynamic> b) {
    return WorkExperienceItem(
      id: id,
      companyName: b['companyName'] as String? ?? '',
      title: b['title'] as String? ?? '',
      startDate: DateTime.tryParse(b['startDate'] as String? ?? '') ?? DateTime.now(),
      endDate: DateTime.tryParse(b['endDate'] as String? ?? ''),
      isCurrent: b['isCurrent'] as bool? ?? false,
      description: b['description'] as String?,
    );
  }
}
