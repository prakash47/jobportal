import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'project_models.dart';
import 'projects_mock.dart';

class ProjectsException implements Exception {
  const ProjectsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Candidate portfolio projects (`/me/projects`, no `/v1`). GET list, POST
/// create, DELETE `:id`. The backend has no PATCH, so editing = delete + create
/// (see [replace]). Static in demo mode.
class ProjectsRepository {
  const ProjectsRepository(this._dio);

  final Dio _dio;

  Future<List<ProjectItem>> list() async {
    if (AppConfig.useMockData) return ProjectsMock.list();
    try {
      final res = await _dio.get<List<dynamic>>('/me/projects');
      return (res.data ?? const [])
          .whereType<Map>()
          .map((m) => ProjectItem.fromJson(m.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ProjectsException(friendlyDioMessage(e));
    }
  }

  Future<ProjectItem> create(Map<String, dynamic> body) async {
    if (AppConfig.useMockData) return ProjectsMock.create(body);
    try {
      final res = await _dio.post<Map<String, dynamic>>('/me/projects', data: body);
      return ProjectItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ProjectsException(friendlyDioMessage(e));
    }
  }

  Future<void> remove(int id) async {
    if (AppConfig.useMockData) {
      ProjectsMock.delete(id);
      return;
    }
    try {
      await _dio.delete<void>('/me/projects/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw ProjectsException(friendlyDioMessage(e));
    }
  }

  /// Edit = delete the old row then create a fresh one, because the API has no
  /// PATCH for this resource.
  ///
  /// The naive form of that -- `await remove(id); return create(body);` -- loses
  /// the row outright whenever the create fails: the candidate opened an editor
  /// to change one field, hit a validation error or a dropped connection, and
  /// the entry they already had is simply gone. Reordering to create-first would avoid the window here, but the two editors are
/// kept on one pattern because languages genuinely cannot do that -- see
/// LanguagesRepository.replace.
  ///
  /// So the original is put back before the failure is surfaced. Restoring uses
  /// a body the server accepted moments ago, and the row it occupied is free
  /// again, so the restore itself is about as reliable as a call can be. If even
  /// that fails, say so plainly rather than letting the row vanish silently.
  Future<ProjectItem> replace(ProjectItem original, Map<String, dynamic> body) async {
    await remove(original.id);
    try {
      return await create(body);
    } catch (_) {
      try {
        await create(original.toCreateBody());
      } catch (_) {
        throw ProjectsException(
          'Your changes could not be saved, and the original could not be '
          'restored. Please add it again.',
        );
      }
      // Original is back on the profile; report why the edit itself failed.
      rethrow;
    }
  }
}

final projectsRepositoryProvider = FutureProvider<ProjectsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ProjectsRepository(dio);
});
