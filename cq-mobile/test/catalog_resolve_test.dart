import 'dart:typed_data';

import 'package:cq_mobile/features/catalogs/data/catalog_models.dart';
import 'package:cq_mobile/features/catalogs/data/catalogs_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _DeadAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException.connectionError(
      requestOptions: options,
      reason: 'no network',
    );
  }

  @override
  void close({bool force = false}) {}
}

CatalogsRepository _repo() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = _DeadAdapter();
  return CatalogsRepository(dio);
}

void main() {
  test('best-effort by default — decoration may quietly show nothing', () async {
    expect(await _repo().resolve(CatalogKind.cities, [1, 2]), isEmpty);
  });

  test(
    'throwOnError surfaces the failure, so the profile editor cannot render '
    '"Any location" and then overwrite the list it never read',
    () async {
      expect(
        () => _repo().resolve(CatalogKind.cities, [1, 2], throwOnError: true),
        throwsA(isA<CatalogsException>()),
      );
    },
  );

  test('an empty id list never hits the network at all', () async {
    expect(
      await _repo().resolve(CatalogKind.cities, const [], throwOnError: true),
      isEmpty,
    );
  });
}
