import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/network_providers.dart';
import 'candidate_profile.dart';

/// A user-friendly onboarding failure. [message] is safe to show in the UI.
class OnboardingException implements Exception {
  const OnboardingException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Talks to the seeker profile endpoints used during onboarding. All writes are
/// PATCH/POST against `/me/*`; the session cookie authenticates them.
///
/// [loadProfile] is called first on purpose: `GET /me/profile` **lazily creates
/// the Candidate row** server-side, so the subsequent skills / education / profile
/// writes (which 404 without it) succeed for a brand-new account.
class OnboardingRepository {
  const OnboardingRepository(this._dio);

  final Dio _dio;

  Future<CandidateProfile> loadProfile() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/me/profile');
      return CandidateProfile.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw OnboardingException(_message(e));
    }
  }

  /// PATCH the candidate profile. [body] must contain only keys the API's
  /// (strict) `ProfilePatchDto` accepts. An empty body is a no-op.
  Future<void> patchProfile(Map<String, dynamic> body) async {
    if (body.isEmpty) return;
    try {
      await _dio.patch<void>('/me/profile', data: body);
    } on DioException catch (e) {
      throw OnboardingException(_message(e));
    }
  }

  /// Replace the candidate's skills. Free-text [customSkills] are find-or-created
  /// server-side, so no catalogue lookup is needed from the app.
  Future<void> saveSkills({
    List<int> skillIds = const [],
    List<String> customSkills = const [],
  }) async {
    try {
      await _dio.patch<void>(
        '/me/skills',
        data: {'skillIds': skillIds, 'customSkills': customSkills},
      );
    } on DioException catch (e) {
      throw OnboardingException(_message(e));
    }
  }

  /// Create one education row (degree or Class 12); returns its new id so the
  /// caller can update-in-place instead of creating a duplicate on a re-save.
  Future<int?> createEducation(Map<String, dynamic> body) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/me/education',
        data: body,
      );
      return (res.data?['id'] as num?)?.toInt();
    } on DioException catch (e) {
      throw OnboardingException(_message(e));
    }
  }

  /// Update an existing education row (used when the user edits and re-saves).
  Future<void> updateEducation(int id, Map<String, dynamic> body) async {
    try {
      await _dio.patch<void>('/me/education/$id', data: body);
    } on DioException catch (e) {
      throw OnboardingException(_message(e));
    }
  }

  String _message(DioException e) {
    if (e.response == null) {
      return "Can't reach the server. Check your connection and try again.";
    }
    final data = e.response?.data;
    if (data is Map && data['message'] is String) {
      return data['message'] as String;
    }
    return 'Something went wrong. Please try again.';
  }
}

/// Built once the (async) Dio client is ready — same pattern as the auth repo.
final onboardingRepositoryProvider = FutureProvider<OnboardingRepository>((
  ref,
) async {
  final dio = await ref.watch(dioProvider.future);
  return OnboardingRepository(dio);
});
