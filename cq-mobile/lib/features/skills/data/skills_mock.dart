import '../../catalogs/data/catalog_models.dart';

// In-memory skills for demo/offline mode (ids match the catalog mock).
abstract final class SkillsMock {
  static List<CatalogItem> current = const [
    CatalogItem(id: 1, slug: 'flutter', name: 'Flutter'),
    CatalogItem(id: 2, slug: 'dart', name: 'Dart'),
    CatalogItem(id: 13, slug: 'sql', name: 'SQL'),
  ];

  static void replace(List<CatalogItem> items) => current = items;
}
