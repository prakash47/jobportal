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

  /// The POST body that would recreate this row exactly as it stands.
  ///
  /// Used to put a project back after an edit fails. The API has no PATCH, so
  /// editing means deleting and recreating, and without this the delete is
  /// unrecoverable.
  Map<String, dynamic> toCreateBody() => <String, dynamic>{
        'title': title,
        if (description != null && description!.isNotEmpty)
          'description': description,
        'techStack': techStack,
        if (url != null && url!.isNotEmpty) 'url': url,
      };

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
