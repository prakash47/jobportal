// Reference catalogs (skills / cities / industries) — `GET /v1/{skills,cities,
// industries}` with `?q=` type-ahead and `?ids=` resolve mode. Used by the job
// filters, the profile editors, and the alert editor.

class CatalogItem {
  const CatalogItem({
    required this.id,
    required this.slug,
    required this.name,
    this.category,
  });

  final int id;
  final String slug;
  final String name;
  final String? category; // skills only

  factory CatalogItem.fromJson(Map<String, dynamic> j) => CatalogItem(
    id: (j['id'] as num?)?.toInt() ?? 0,
    slug: j['slug'] as String? ?? '',
    name: j['name'] as String? ?? '',
    category: j['category'] as String?,
  );

  /// Identity is the SLUG, not the id.
  ///
  /// Two call sites legitimately hold an item with no real id: an alert stores
  /// its query as `skillSlugs`/`citySlugs` (never ids) and rebuilds items from
  /// those, and a Home facet chip arrives through the route with `id: 0`. When
  /// the picker then loaded the real rows from `/v1/skills` or `/v1/cities`,
  /// id-equality made every already-chosen entry look unselected — so the user
  /// tapped to confirm it and got a DUPLICATE, which then saved as
  /// `citySlugs: ['bengaluru', 'bengaluru']`.
  ///
  /// The slug is unique per catalogue and is always the real one, so it is the
  /// honest key.
  @override
  bool operator ==(Object other) =>
      other is CatalogItem &&
      // Slug when we have one; id otherwise, so a pair of slug-less items can
      // never collapse into each other.
      (slug.isNotEmpty || other.slug.isNotEmpty
          ? other.slug == slug
          : other.id == id);
  @override
  int get hashCode => slug.isNotEmpty ? slug.hashCode : id.hashCode;
}

class CatalogPage {
  const CatalogPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<CatalogItem> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory CatalogPage.fromJson(Map<String, dynamic> j) => CatalogPage(
    hits: ((j['hits'] as List?) ?? const [])
        .whereType<Map>()
        .map((m) => CatalogItem.fromJson(m.cast<String, dynamic>()))
        .toList(),
    total: (j['total'] as num?)?.toInt() ?? 0,
    page: (j['page'] as num?)?.toInt() ?? 1,
    pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
  );
}

enum CatalogKind { skills, cities, industries }

extension CatalogKindX on CatalogKind {
  String get path => switch (this) {
    CatalogKind.skills => '/v1/skills',
    CatalogKind.cities => '/v1/cities',
    CatalogKind.industries => '/v1/industries',
  };

  String get plural => switch (this) {
    CatalogKind.skills => 'skills',
    CatalogKind.cities => 'cities',
    CatalogKind.industries => 'industries',
  };

  String get singular => switch (this) {
    CatalogKind.skills => 'skill',
    CatalogKind.cities => 'city',
    CatalogKind.industries => 'industry',
  };
}
