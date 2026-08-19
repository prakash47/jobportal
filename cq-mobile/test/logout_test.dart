import 'dart:typed_data';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Fails every request — a logout attempted with no connectivity.
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

void main() {
  test(
    'logout wipes the session cookies even when the server call fails',
    () async {
      final jar = CookieJar();
      final uri = Uri.parse('http://localhost/');
      // Stand in for what the server sets on login.
      await jar.saveFromResponse(uri, [
        Cookie('access_token', 'a-token'),
        Cookie('refresh_token', 'a-30-day-credential'),
      ]);
      expect((await jar.loadForRequest(uri)).length, 2);

      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
        ..httpClientAdapter = _DeadAdapter();

      final container = ProviderContainer(
        overrides: [
          cookieJarProvider.overrideWith((ref) async => jar),
          dioProvider.overrideWith((ref) async => dio),
        ],
      );
      addTearDown(container.dispose);

      await container.read(authControllerProvider.notifier).logout();

      // The whole point: the credential must not survive a failed logout, or
      // the next launch signs the user back in without a password.
      expect(
        await jar.loadForRequest(uri),
        isEmpty,
        reason: 'a failed server revoke must still clear the device',
      );
      expect(container.read(authControllerProvider), isA<AuthUnauthenticated>());
    },
  );
}
