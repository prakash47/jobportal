import 'package:cq_mobile/features/catalogs/data/catalog_models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Identity has to survive the two places that hold an item with no real id:
/// an alert (which stores slugs, never ids) and a Home facet chip (id 0).
void main() {
  test('the same slug is the same item, whatever the id says', () {
    // What an alert rebuilds from its saved query…
    const fromAlert = CatalogItem(id: 0, slug: 'bengaluru', name: 'Bengaluru');
    // …versus what /v1/cities actually returns.
    const fromApi = CatalogItem(id: 4, slug: 'bengaluru', name: 'Bengaluru');

    expect(fromAlert, fromApi);
    expect({fromAlert}.contains(fromApi), isTrue,
        reason: 'the picker must show it already ticked');
  });

  test('a set will not hold the same city twice', () {
    // The duplicate that used to reach the server as
    // citySlugs: ['bengaluru', 'bengaluru'].
    final selected = <CatalogItem>{
      const CatalogItem(id: 0, slug: 'bengaluru', name: 'Bengaluru'),
    };
    selected.add(const CatalogItem(id: 4, slug: 'bengaluru', name: 'Bengaluru'));

    expect(selected.length, 1);
  });

  test('slug-less items fall back to id, so they cannot collapse together', () {
    // Custom skills can arrive without a slug; two of them must stay distinct.
    const a = CatalogItem(id: -7, slug: '', name: 'Kubernetes ops');
    const b = CatalogItem(id: -9, slug: '', name: 'Incident response');

    expect(a, isNot(b));
    expect({a, b}.length, 2);
  });

  test('different slugs stay different even if ids collide', () {
    const a = CatalogItem(id: 0, slug: 'pune', name: 'Pune');
    const b = CatalogItem(id: 0, slug: 'mumbai', name: 'Mumbai');

    expect(a, isNot(b));
    expect({a, b}.length, 2);
  });
}
