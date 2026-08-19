/// One language from `GET /me/languages`. Proficiency is one of BEGINNER |
/// INTERMEDIATE | ADVANCED. Unique per candidate + name (409 on duplicate).
class LanguageItem {
  const LanguageItem({
    required this.id,
    required this.name,
    required this.proficiency,
    required this.createdAt,
  });

  final int id;
  final String name;
  final String proficiency;
  final DateTime createdAt;

  /// The POST body that would recreate this row exactly as it stands. See
  /// ProjectItem.toCreateBody for why this exists.
  Map<String, dynamic> toCreateBody() =>
      <String, dynamic>{'name': name, 'proficiency': proficiency};

  String get proficiencyLabel => proficiencyLabelOf(proficiency);

  factory LanguageItem.fromJson(Map<String, dynamic> j) => LanguageItem(
    id: (j['id'] as num?)?.toInt() ?? 0,
    name: j['name'] as String? ?? '',
    proficiency: j['proficiency'] as String? ?? 'INTERMEDIATE',
    createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
  );
}

const List<String> languageProficiencies = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
];

String proficiencyLabelOf(String p) => switch (p) {
  'BEGINNER' => 'Beginner',
  'INTERMEDIATE' => 'Intermediate',
  'ADVANCED' => 'Advanced',
  _ => p,
};
