import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/data/catalogs_mock.dart';
import 'skills_mock.dart';

class SkillsException implements Exception {
  const SkillsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The candidate's skills. There is no `GET /me/skills`, so current skills are
/// read as `skillIds` from `GET /me/profile` and resolved to labels via
/// `GET /v1/skills?ids=`. Saving is a FULL-SET replace via `PATCH /me/skills`
/// (`{skillIds, customSkills}` — free-text customs are find-or-created
/// server-side). Static in demo mode.
class SkillsRepository {
  const SkillsRepository(this._dio);

  final Dio _dio;

  Future<List<CatalogItem>> current() async {
    if (AppConfig.useMockData) return SkillsMock.current;
    try {
      final profile = await _dio.get<Map<String, dynamic>>('/me/profile');
      final c = (profile.data?['candidate'] as Map?)?.cast<String, dynamic>() ?? const {};
      final ids = ((c['skillIds'] as List?) ?? const [])
          .whereType<num>()
          .map((n) => n.toInt())
          .toList();
      if (ids.isEmpty) return const [];
      final res = await _dio.get<Map<String, dynamic>>(
        '/v1/skills',
        queryParameters: {'ids': ids.join(',')},
      );
      return CatalogPage.fromJson(res.data ?? const {}).hits;
    } on DioException catch (e) {
      throw SkillsException(friendlyDioMessage(e));
    }
  }

  Future<void> save({
    required List<int> skillIds,
    List<String> customSkills = const [],
  }) async {
    if (AppConfig.useMockData) {
      final resolved = await CatalogMock.resolve(CatalogKind.skills, skillIds);
      final customs = [
        for (final n in customSkills)
          if (n.trim().isNotEmpty)
            CatalogItem(
              id: -(n.trim().toLowerCase().hashCode & 0x7fffffff) - 1,
              slug: n.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-'),
              name: n.trim(),
            ),
      ];
      SkillsMock.replace([...resolved, ...customs]);
      return;
    }
    try {
      await _dio.patch<void>(
        '/me/skills',
        data: {'skillIds': skillIds, 'customSkills': customSkills},
      );
    } on DioException catch (e) {
      throw SkillsException(friendlyDioMessage(e));
    }
  }
}

final skillsRepositoryProvider = FutureProvider<SkillsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return SkillsRepository(dio);
});
