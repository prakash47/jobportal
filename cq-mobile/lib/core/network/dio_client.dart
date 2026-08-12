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
Dio buildDioClient(CookieJar cookieJar) {
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
  // lives 30 days. When a request 401s because the access token expired, hit
  // `POST /auth/refresh` (which rotates using the refresh cookie), then retry
  // the original request **once**. This keeps the user signed in for the full
  // 30 days instead of every 15 minutes. Guards prevent loops: we never refresh
  // for the auth endpoints themselves, and never retry a request twice.
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
          try {
            await dio.post<void>('/auth/refresh');
            final opts = e.requestOptions..extra['cq_retried'] = true;
            return handler.resolve(await dio.fetch<dynamic>(opts));
          } catch (_) {
            // Refresh failed → the session is truly gone; fall through to 401.
          }
        }
        handler.next(e);
      },
    ),
  );

  // Verbose request/response logging — DEBUG builds only, never ships to users.
  if (kDebugMode) {
    dio.interceptors.add(
      LogInterceptor(
        requestHeader: false,
        requestBody: true,
        responseHeader: false,
        responseBody: true,
        logPrint: (line) => debugPrint('[Dio] $line'),
      ),
    );
  }

  return dio;
}
