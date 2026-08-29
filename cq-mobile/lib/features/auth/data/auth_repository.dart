import 'package:dio/dio.dart';

import '../../../core/network/api_error.dart';

import 'auth_user.dart';

/// A user-friendly auth failure. [message] is safe to show directly in the UI.
class AuthException implements Exception {
  const AuthException(this.message, {this.resendInSeconds});
  final String message;

  /// Seconds to wait before another code may be requested.
  ///
  /// Present on the signup-OTP cooldown 429, whose body carries it precisely so
  /// a rejected resend still knows when to re-arm rather than guessing.
  final int? resendInSeconds;

  @override
  String toString() => message;
}

/// What `POST /auth/signup/otp/request` hands back.
///
/// The website now verifies an address BEFORE any account row exists, and the
/// app has to do the same: `/auth/register` refuses a body without a
/// [signupId] that has been verified for that exact address.
class SignupChallenge {
  const SignupChallenge({required this.signupId, required this.resendInSeconds});

  final String signupId;

  /// A DURATION, not an instant — run the countdown from this plus elapsed
  /// local time. Subtracting a device clock from the server's
  /// `resendAvailableAt` bakes the phone's clock skew into the countdown, which
  /// is a bug the web client shipped and had to fix.
  final int resendInSeconds;

  factory SignupChallenge.fromJson(Map<String, dynamic> j) => SignupChallenge(
    signupId: j['signupId'] as String? ?? '',
    resendInSeconds: (j['resendInSeconds'] as num?)?.toInt() ?? 30,
  );
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

  /// Ask the server to email a 6-digit code, before any account exists.
  ///
  /// Pass [signupId] back on a resend so the same challenge row is replaced
  /// rather than a second one created for the same address.
  Future<SignupChallenge> requestSignupOtp({
    required String name,
    required String email,
    String? signupId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/signup/otp/request',
        data: {
          'name': name,
          'email': email,
          if (signupId != null && signupId.isNotEmpty) 'signupId': signupId,
        },
      );
      return SignupChallenge.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      // The cooldown 429 is the one failure the caller can act on precisely, so
      // its seconds travel with the message instead of being flattened away.
      final data = e.response?.data;
      final seconds = data is Map ? (data['resendInSeconds'] as num?)?.toInt() : null;
      throw AuthException(
        _messageFor(e, fallback: 'Could not send the code. Please try again.'),
        resendInSeconds: seconds,
      );
    }
  }

  /// Confirm the emailed code. The account still does not exist after this —
  /// it is [register] that creates it, using the now-verified [signupId].
  Future<void> verifySignupOtp({
    required String signupId,
    required String code,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/signup/otp/verify',
        data: {'signupId': signupId, 'code': code},
      );
    } on DioException catch (e) {
      // The server counts down ("2 attempts left"), says when the code has
      // expired, and says when the budget is spent — each needs a different
      // move from the user, so its sentence is surfaced rather than replaced.
      throw AuthException(
        _messageFor(e, fallback: 'Could not check that code. Please try again.'),
      );
    }
  }

  Future<AuthUser> register({
    required String name,
    required String email,
    required String password,
    required String signupId,
    String? phone,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'name': name,
          'email': email,
          'password': password,
          // Required since the website's signup-OTP work: the server refuses to
          // create a User row for an address it has not just verified.
          'signupId': signupId,
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
        // The server counts down — 'That code is incorrect. 3 attempts left.'
        // — and once the five are spent says 'Too many incorrect attempts.
        // Request a new code.', which is the ONLY signal that the code in the
        // user's hand is now permanently dead. Flattening both into one line
        // left them retyping a code that could never work.
        throw AuthException(
          serverMessage(e) ?? 'That code is incorrect or has expired.',
        );
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
        // Covers both an expired ticket and a rejected password. Blaming the
        // ticket for a password the server refused sent the user back to step
        // one for no reason.
        throw AuthException(
          serverMessage(e) ?? 'That reset session expired. Please start again.',
        );
      }
      throw AuthException(
        _messageFor(e, fallback: 'Could not reset your password. Please try again.'),
      );
    }
  }

  /// Returns the signed-in user, or `null` when there's no valid session
  /// (401 / offline). Used on app launch to restore the session.
  /// Re-send the address-verification email to the signed-in user.
  ///
  /// `POST /auth/resend-verification` — JWT-guarded, 204, no body. The server
  /// throttles this to **one request per minute**, which is a real state the UI
  /// has to explain rather than swallow, and it refuses outright when email
  /// sending is disabled on the environment.
  Future<void> resendVerification() async {
    try {
      await _dio.post<void>('/auth/resend-verification');
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 429) {
        throw const AuthException(
          'An email was just sent. Please wait a minute before asking again.',
        );
      }
      if (status == 503) {
        throw const AuthException(
          'Sending email is unavailable right now. Please try again later.',
        );
      }
      throw AuthException(
        _messageFor(e, fallback: 'Could not send the email. Please try again.'),
      );
    }
  }

  /// Ask the server who we are, KEEPING the reason it failed.
  ///
  /// This used to be `Future<AuthUser?> currentUser()` which caught every
  /// `DioException` and returned null. That collapsed two completely different
  /// situations — "you are signed out" and "I could not reach the server" — into
  /// one value, and the caller had no choice but to treat both as signed out. A
  /// user launching the app in a lift was logged out of a valid 30-day session.
  Future<SessionProbe> probeSession() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/auth/me');
      final user = res.data?['user'];
      if (user is Map<String, dynamic>) {
        return SessionActive(AuthUser.fromJson(user));
      }
      // 200 with no user is the server telling us there is no session.
      return const SessionNone();
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) return const SessionNone();
      return const SessionUnknown();
    } catch (_) {
      // A malformed body is not evidence about the session either way.
      return const SessionUnknown();
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
      // 401 and 409 keep the app's own wording on purpose: the server answers
      // 'Invalid email or password' and 'Email already registered', which say
      // the same thing less kindly. Everything else defers to the server,
      // which knows things this switch cannot.
      401 => 'Incorrect email or password.',
      409 => 'An account with this email already exists.',
      // A 400 here is a DTO rejection — 'Password must be 8+ chars and include
      // at least one digit and one special character', or a Zod issue naming
      // the field. Answering 'check your details' instead left the candidate
      // guessing which of six inputs was wrong, on the screen where they have
      // the least context.
      400 => serverMessage(e) ?? 'Please check your details and try again.',
      429 => _tooManyAttempts(e),
      _ => fallback,
    };
  }

  /// The login lock-out runs an HOUR, not a minute.
  ///
  /// PerEmailThrottleGuard blocks an address for 3600s after 10 failures and
  /// sets Retry-After to the lock's real remaining TTL — its own comment says
  /// the header exists so clients stop guessing. Answering every 429 with
  /// 'wait a minute' sent a locked-out candidate into a retry loop that could
  /// not succeed, and each retry re-trips the guard.
  String _tooManyAttempts(DioException e) {
    final seconds = int.tryParse(e.response?.headers.value('retry-after') ?? '');
    if (seconds == null || seconds <= 0) {
      return serverMessage(e) ?? 'Too many attempts. Please try again later.';
    }
    return 'Too many attempts. Try again in ${_humanWait(seconds)}.';
  }

  /// Seconds → something a person would say. Rounded deliberately: the exact
  /// remaining TTL is noise, and a candidate only needs to know whether this is
  /// a coffee or a tomorrow.
  String _humanWait(int seconds) {
    if (seconds < 90) return 'a minute';
    final minutes = (seconds / 60).round();
    if (minutes < 60) return '$minutes minutes';
    final hours = (minutes / 60).round();
    return hours == 1 ? 'an hour' : '$hours hours';
  }
}

/// The three possible answers to "is there a session?" — the middle one is the
/// whole reason this type exists.
sealed class SessionProbe {
  const SessionProbe();
}

/// The server confirmed a live session.
class SessionActive extends SessionProbe {
  const SessionActive(this.user);
  final AuthUser user;
}

/// The server explicitly said there is no session (401/403). Sign out.
class SessionNone extends SessionProbe {
  const SessionNone();
}

/// We could not reach the server. The session may be perfectly valid — do NOT
/// sign anyone out on this.
class SessionUnknown extends SessionProbe {
  const SessionUnknown();
}
