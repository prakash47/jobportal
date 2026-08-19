import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

/// Builds the app's single, shared [Dio] HTTP client.
///
/// Why the cookie jar? The Career Queue API returns the login session as
/// **HttpOnly cookies** (`access_token`, `refresh_token`) — never as tokens in
/// the JSON body. [CookieManager] captures those `Set-Cookie` headers into
/// [cookieJar] and replays them on every later request, exactly like a browser.
/// A *persistent* jar (created in `main.dart`) makes the session survive app
/// restarts, so the user stays logged in.
/// Why a refresh can end three different ways — the distinction is the whole
/// point of [RefreshOutcome].
enum RefreshOutcome {
  /// New cookies issued; the caller should retry.
  renewed,

  /// The server refused the refresh token itself (401/403). The session is
  /// genuinely dead and the user has to sign in again.
  rejected,

  /// We could not reach the server, or it failed. The session may be perfectly
  /// valid — treating this as "logged out" would throw a commuter off the app
  /// every time they went through a tunnel.
  unreachable,
}

Dio buildDioClient(CookieJar cookieJar, {VoidCallback? onSessionExpired}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: const {'Accept': 'application/json'},
    ),
  );

  // Runs on every request/response: attaches session cookies going out,
  // stores any Set-Cookie coming back.
  dio.interceptors.add(CookieManager(cookieJar));

  // Silent session refresh. The access token lives 15 min; the refresh token
  // lives 30 days. When a request 401s, refresh once and retry the original.
  //
  // SINGLE-FLIGHT, and that is not an optimisation — it is a correctness fix.
  // The server ROTATES the refresh token and atomically revokes the old session
  // on every refresh, so two concurrent refreshes mean the second one presents
  // a token the first already killed: it fails, and the user is signed out at
  // random. Home alone fires four authenticated requests in parallel by design,
  // so an expired access token there produced exactly that race. Every 401 now
  // awaits the SAME in-flight refresh.
  Future<RefreshOutcome>? inFlight;

  Future<RefreshOutcome> refreshOnce() async {
    try {
      await dio.post<void>('/auth/refresh');
      return RefreshOutcome.renewed;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      // Only the server explicitly refusing the token means the session is
      // dead. A timeout, a DNS failure or a 500 must NOT log anyone out.
      if (status == 401 || status == 403) return RefreshOutcome.rejected;
      return RefreshOutcome.unreachable;
    } catch (_) {
      return RefreshOutcome.unreachable;
    }
  }

  dio.interceptors.add(
    InterceptorsWrapper(
      onError: (e, handler) async {
        final path = e.requestOptions.path;
        final isAuthEndpoint =
            path.contains('/auth/login') ||
            path.contains('/auth/register') ||
            path.contains('/auth/refresh') ||
            path.contains('/auth/logout');
        final alreadyRetried = e.requestOptions.extra['cq_retried'] == true;

        if (e.response?.statusCode == 401 &&
            !isAuthEndpoint &&
            !alreadyRetried) {
          // `??=` short-circuits, so concurrent 401s share one refresh rather
          // than each starting their own.
          final outcome = await (inFlight ??=
              refreshOnce().whenComplete(() => inFlight = null));

          if (outcome == RefreshOutcome.renewed) {
            try {
              final opts = e.requestOptions..extra['cq_retried'] = true;
              // A multipart body is a STREAM, and the first attempt consumed
              // it. Replaying the same FormData sends an empty or truncated
              // body, so a resume upload that happened to hit an expired
              // access token uploaded nothing and said nothing. `clone()`
              // rebuilds it (MultipartFile.fromFile can re-open the path).
              final body = opts.data;
              if (body is FormData) opts.data = body.clone();
              return handler.resolve(await dio.fetch<dynamic>(opts));
            } catch (_) {
              // Retry itself failed — fall through with the original error.
            }
          } else if (outcome == RefreshOutcome.rejected) {
            // Tell the app the session is over. Without this the interceptor
            // silently fell through to a 401 that each repository turned into a
            // generic "something went wrong", leaving the user inside a signed-
            // in shell where nothing loaded and no screen ever offered a login.
            onSessionExpired?.call();
          }
        }
        handler.next(e);
      },
    ),
  );

  // Verbose request/response logging — DEBUG builds only, never ships to users.
  //
  // Excluded from tests as well: `kDebugMode` is true under `flutter test`, so
  // without this every mocked request printed a request/response block and
  // buried the actual test output.
  final inTest = Platform.environment.containsKey('FLUTTER_TEST');
  if (kDebugMode && !inTest) {
    dio.interceptors.add(RedactingLogInterceptor());
  }

  return dio;
}

/// Dio's own LogInterceptor with the credentials taken out.
///
/// `requestBody: true` printed the login, registration and password-reset
/// bodies verbatim, so a plaintext password, an OTP code and a reset ticket all
/// reached logcat. It is debug-only, which sounds like it contains the problem
/// until you remember what a debug build is FOR: it is the APK handed to a
/// colleague to try, sitting on someone else's phone where any process holding
/// READ_LOGS, any crash reporter and any `adb logcat` sees it.
///
/// Dio offers no hook to filter the body, so this replaces LogInterceptor
/// rather than configuring it. Everything else about a request is still
/// printed — the value of the log is the method, path, status and shape, not
/// the secret.
class RedactingLogInterceptor extends Interceptor {
  /// Compared lower-cased, so `newPassword` and `new_password` both match.
  static const _secretKeys = <String>{
    'password',
    'currentpassword',
    'newpassword',
    'confirmpassword',
    'oldpassword',
    'otp',
    'code',
    'token',
    'accesstoken',
    'refreshtoken',
    'ticket',
    'secret',
    'authorization',
  };

  static const _mask = '***';

  /// Walks maps and lists so a secret nested in an envelope is still caught.
  static Object? redact(Object? value) {
    if (value is Map) {
      return {
        for (final e in value.entries)
          e.key: _isSecret(e.key) ? _mask : redact(e.value),
      };
    }
    if (value is List) return [for (final v in value) redact(v)];
    // A multipart upload's fields are not worth printing and may carry a file.
    if (value is FormData) return '<FormData: ${value.files.length} file(s)>';
    return value;
  }

  static bool _isSecret(Object? key) {
    if (key is! String) return false;
    return _secretKeys.contains(key.toLowerCase().replaceAll('_', ''));
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    debugPrint('[Dio] --> ${options.method} ${options.uri}');
    if (options.data != null) {
      debugPrint('[Dio] body: ${redact(options.data)}');
    }
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    debugPrint(
      '[Dio] <-- ${response.statusCode} ${response.requestOptions.uri}',
    );
    if (response.data != null) {
      debugPrint('[Dio] body: ${redact(response.data)}');
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    debugPrint(
      '[Dio] <-- ERROR ${err.response?.statusCode} '
      '${err.requestOptions.uri} ${err.message}',
    );
    if (err.response?.data != null) {
      debugPrint('[Dio] body: ${redact(err.response!.data)}');
    }
    handler.next(err);
  }
}
