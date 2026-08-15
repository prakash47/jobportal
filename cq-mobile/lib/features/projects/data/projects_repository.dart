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

  /// Edit = delete the old row then create a fresh one (no PATCH on the API).
  Future<ProjectItem> replace(int id, Map<String, dynamic> body) async {
    await remove(id);
    return create(body);
  }
}

final projectsRepositoryProvider = FutureProvider<ProjectsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ProjectsRepository(dio);
});
