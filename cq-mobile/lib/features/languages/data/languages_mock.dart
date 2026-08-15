import 'language_models.dart';

// In-memory languages for demo/offline mode.
abstract final class LanguagesMock {
  static final List<LanguageItem> _items = [
    LanguageItem(
      id: 1,
      name: 'English',
      proficiency: 'ADVANCED',
      createdAt: DateTime.now().subtract(const Duration(days: 30)),
    ),
    LanguageItem(
      id: 2,
      name: 'Hindi',
      proficiency: 'ADVANCED',
      createdAt: DateTime.now().subtract(const Duration(days: 29)),
    ),
  ];

  static int _nextId = 3;

  static List<LanguageItem> list() {
    final copy = [..._items];
    copy.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return copy;
  }

  static LanguageItem create(Map<String, dynamic> body) {
    final name = (body['name'] as String? ?? '').trim();
    final exists = _items.any((e) => e.name.toLowerCase() == name.toLowerCase());
    if (exists) throw StateError('duplicate');
    final item = LanguageItem(
      id: _nextId++,
      name: name,
      proficiency: body['proficiency'] as String? ?? 'INTERMEDIATE',
      createdAt: DateTime.now(),
    );
    _items.add(item);
    return item;
  }

  static void delete(int id) => _items.removeWhere((e) => e.id == id);
}
