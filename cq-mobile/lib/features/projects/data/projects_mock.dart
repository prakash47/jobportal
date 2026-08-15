import 'project_models.dart';

// In-memory projects for demo/offline mode. Add/delete mutate the list so the
// manager feels live without a server.
abstract final class ProjectsMock {
  static final List<ProjectItem> _items = [
    ProjectItem(
      id: 1,
      title: 'CQ Mobile — Job app',
      description: 'A premium Flutter job-seeker app consuming a NestJS backend.',
      techStack: const ['Flutter', 'Riverpod', 'Dio', 'NestJS'],
      url: 'https://github.com/example/cq-mobile',
      createdAt: DateTime.now().subtract(const Duration(days: 20)),
    ),
  ];

  static int _nextId = 2;

  static List<ProjectItem> list() {
    final copy = [..._items];
    copy.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return copy;
  }

  static ProjectItem create(Map<String, dynamic> body) {
    final item = ProjectItem(
      id: _nextId++,
      title: body['title'] as String? ?? '',
      description: body['description'] as String?,
      techStack: ((body['techStack'] as List?) ?? const [])
          .whereType<String>()
          .toList(),
      url: body['url'] as String?,
      createdAt: DateTime.now(),
    );
    _items.add(item);
    return item;
  }

  static void delete(int id) => _items.removeWhere((e) => e.id == id);
}
