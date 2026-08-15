import 'package:dio/dio.dart';

import 'auth_user.dart';

/// A user-friendly auth failure. [message] is safe to show directly in the UI.
class AuthException implements Exception {
  const AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Timing for the password-reset OTP (durations in seconds, per the contract —
/// run countdowns off these, never off wall-clock instants).
class OtpChallenge {
  const OtpChallenge({required this.resendInSeconds, required this.expiresInSeconds});
  final int resendInSeconds;
  final int expiresInSeconds;

  factory OtpChallenge.fromJson(Map<String, dynamic> j) => OtpChallenge(
    resendInSeconds: (j['resendInSeconds'] as num?)?.toInt() ?? 30,
    expiresInSeconds: (j['expiresInSeconds'] as num?)?.toInt() ?? 600,
  );
}

/// Talks to the Career Queue `/auth/*` endpoints.
///
/// The login session is handled by cookies (see `dio_client.dart`), so these
/// methods only send/receive JSON — the tokens are stored/attached invisibly by
/// the cookie jar.
class AuthRepository {
  const AuthRepository(this._dio);

  final Dio _dio;

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      return _userFrom(res.data);
    } on DioException catch (e) {
      throw AuthException(
        _messageFor(e, fallback: 'Could not sign you in. Please try again.'),
      );
    }
  }

  Future<AuthUser> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'name': name,
          'email': email,
          'password': password,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
        },
      );
      return _userFrom(res.data);
    } on DioException catch (e) {
      throw AuthException(
        _messageFor(e, fallback: 'Could not create your account. Please try again.'),
      );
    }
  }

  // ── Password reset (3-step OTP, `/auth/*`, cookie-based) ──
  // 1) request a code → 2) verify it for a ticket → 3) set a new password. Step
  // 3 sets fresh session cookies, so the user is signed in on success.

  Future<OtpChallenge> requestPasswordResetOtp(String email) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/forgot-password',
        data: {'email': email},
      );
      return OtpChallenge.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 503) {
        throw const AuthException(
          'Password reset is temporarily unavailable. Please try again later.',
        );
      }
      throw AuthException(
        _messageFor(e, fallback: 'Could not send the code. Please try again.'),
      );
    }
  }

  /// Verify the 6-digit code; returns an opaque ticket for the reset step.
  Future<String> verifyResetOtp({required String email, required String code}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/verify-reset-otp',
        data: {'email': email, 'code': code},
      );
      final ticket = res.data?['ticket'] as String?;
      if (ticket == null || ticket.isEmpty) {
        throw const AuthException('Unexpected response from the server.');
      }
      return ticket;
    } on DioException catch (e) {
      if (e.response?.statusCode == 400) {
        throw const AuthException('That code is incorrect or has expired.');
      }
      throw AuthException(
        _messageFor(e, fallback: 'Could not verify the code. Please try again.'),
      );
    }
  }

  /// Set the new password. The response sets fresh session cookies (captured by
  /// the cookie jar), so the returned user is signed in.
  Future<AuthUser> resetPassword({
    required String ticket,
    required String password,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/reset-password',
        data: {'ticket': ticket, 'password': password},
      );
      return _userFrom(res.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 400) {
        throw const AuthException('That reset session expired. Please start again.');
      }
      throw AuthException(
        _messageFor(e, fallback: 'Could not reset your password. Please try again.'),
      );
    }
  }

  /// Returns the signed-in user, or `null` when there's no valid session
  /// (401 / offline). Used on app launch to restore the session.
  Future<AuthUser?> currentUser() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/auth/me');
      final user = res.data?['user'];
      return user is Map<String, dynamic> ? AuthUser.fromJson(user) : null;
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post<void>('/auth/logout');
    } on DioException {
      // Even if the server call fails, the caller still clears local state.
    }
  }

  AuthUser _userFrom(Map<String, dynamic>? body) {
    final user = body?['user'];
    if (user is Map<String, dynamic>) return AuthUser.fromJson(user);
    throw const AuthException('Unexpected response from the server.');
  }

  /// Maps a Dio error to a short, human message.
  String _messageFor(DioException e, {required String fallback}) {
    if (e.response == null) {
      // No HTTP response at all → the request never reached the API. In dev this
      // almost always means the backend/Docker isn't running or the adb-reverse
      // tunnel dropped. Keep it human — the raw Dio error is noise to the user.
      return switch (e.type) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout =>
          'The server took too long to respond. Please try again.',
        _ =>
          "Can't reach the server. Please check your connection and try again.",
      };
    }
    return switch (e.response!.statusCode) {
      401 => 'Incorrect email or password.',
      409 => 'An account with this email already exists.',
      400 => 'Please check your details and try again.',
      429 => 'Too many attempts. Please wait a minute and try again.',
      _ => fallback,
    };
  }
}
