import 'catalog_models.dart';

// Sample catalog data for demo/offline mode. Small, realistic sets so the
// pickers and filters work with no server.

const _skills = <String>[
  'Flutter', 'Dart', 'React', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
  'Java', 'Kotlin', 'Swift', 'Go', 'Rust', 'SQL', 'PostgreSQL', 'MongoDB',
  'Redis', 'AWS', 'Docker', 'Kubernetes', 'Terraform', 'GraphQL', 'REST APIs',
  'Figma', 'UI Design', 'Product Design', 'Machine Learning', 'Data Analysis',
  'Power BI', 'Excel', 'SEO', 'Content Writing', 'Selenium', 'Manual Testing',
  'Communication', 'Salesforce', 'Recruitment',
];

const _cities = <String>[
  'Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata',
  'Gurugram', 'Noida', 'Ahmedabad', 'Jaipur', 'Kochi', 'Indore', 'Chandigarh',
  'Coimbatore', 'Remote',
];

const _industries = <String>[
  'Software', 'IT / Software', 'Healthcare', 'Analytics', 'Gaming', 'FMCG',
  'Real Estate', 'Fintech', 'E-commerce', 'Education', 'Manufacturing',
  'Hospitality', 'Banking & Finance', 'Media', 'Telecom',
];

String _slug(String s) =>
    s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');

List<CatalogItem> _items(List<String> names) => [
  for (var i = 0; i < names.length; i++)
    CatalogItem(id: i + 1, slug: _slug(names[i]), name: names[i]),
];

abstract final class CatalogMock {
  static List<CatalogItem> _all(CatalogKind kind) => switch (kind) {
    CatalogKind.skills => _items(_skills),
    CatalogKind.cities => _items(_cities),
    CatalogKind.industries => _items(_industries),
  };

  static Future<CatalogPage> search(
    CatalogKind kind, {
    String? q,
    int page = 1,
    int pageSize = 30,
  }) async {
    await Future.delayed(const Duration(milliseconds: 150));
    var list = _all(kind);
    final needle = q?.trim().toLowerCase() ?? '';
    if (needle.isNotEmpty) {
      list = list.where((c) => c.name.toLowerCase().contains(needle)).toList();
    }
    final total = list.length;
    final start = (page - 1) * pageSize;
    final hits = start >= total
        ? <CatalogItem>[]
        : list.sublist(start, (start + pageSize).clamp(0, total));
    return CatalogPage(hits: hits, total: total, page: page, pageSize: pageSize);
  }

  static Future<List<CatalogItem>> resolve(CatalogKind kind, List<int> ids) async {
    final all = _all(kind);
    return all.where((c) => ids.contains(c.id)).toList();
  }
}
