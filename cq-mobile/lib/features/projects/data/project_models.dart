/// One portfolio project from `GET /me/projects`. Writable fields mirror the
/// backend `ProjectCreateDto` (title, description, techStack, url).
class ProjectItem {
  const ProjectItem({
    required this.id,
    required this.title,
    this.description,
    this.techStack = const [],
    this.url,
    required this.createdAt,
  });

  final int id;
  final String title;
  final String? description;
  final List<String> techStack;
  final String? url;
  final DateTime createdAt;

  factory ProjectItem.fromJson(Map<String, dynamic> j) => ProjectItem(
    id: (j['id'] as num?)?.toInt() ?? 0,
    title: j['title'] as String? ?? '',
    description: j['description'] as String?,
    techStack: ((j['techStack'] as List?) ?? const [])
        .whereType<String>()
        .toList(),
    url: j['url'] as String?,
    createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
  );
}
