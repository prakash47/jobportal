import 'dart:typed_data';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:cq_mobile/core/network/dio_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// A fake transport: every request is answered from [handler] without a socket.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<String> calls = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    calls.add(options.path);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status) =>
    ResponseBody.fromString('{}', status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

void main() {
  group('401 refresh', () {
    test(
      'concurrent 401s share ONE refresh — the server revokes on rotate, so a '
      'second refresh would kill the first and sign the user out',
      () async {
        var refreshes = 0;
        var protectedHits = 0;

        late _FakeAdapter adapter;
        adapter = _FakeAdapter((options) async {
          if (options.path == '/auth/refresh') {
            refreshes++;
            await Future<void>.delayed(const Duration(milliseconds: 30));
            return _json(200);
          }
          protectedHits++;
          // 401 the first time each request is seen, 200 after the retry.
          final retried = options.extra['cq_retried'] == true;
          return _json(retried ? 200 : 401);
        });

        final dio = buildDioClient(CookieJar());
        dio.httpClientAdapter = adapter;

        // Home fires four authenticated requests in parallel by design.
        await Future.wait([
          dio.get<dynamic>('/me/applications'),
          dio.get<dynamic>('/me/saved-jobs'),
          dio.get<dynamic>('/me/alerts'),
          dio.get<dynamic>('/me/profile'),
        ]);

        expect(refreshes, 1, reason: 'four parallel 401s must refresh once');
        expect(protectedHits, 8, reason: '4 initial 401s + 4 successful retries');
      },
    );

    test('a REFUSED refresh (401) reports the session as expired', () async {
      var expired = 0;

      final adapter = _FakeAdapter((options) async {
        if (options.path == '/auth/refresh') return _json(401);
        return _json(401);
      });

      final dio = buildDioClient(CookieJar(), onSessionExpired: () => expired++);
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.get<dynamic>('/me/profile'),
        throwsA(isA<DioException>()),
      );
      expect(expired, 1);
    });

    test(
      'an UNREACHABLE server does NOT sign the user out — a tunnel is not a '
      'logout',
      () async {
        var expired = 0;

        final adapter = _FakeAdapter((options) async {
          if (options.path == '/auth/refresh') {
            throw DioException.connectionError(
              requestOptions: options,
              reason: 'no network',
            );
          }
          return _json(401);
        });

        final dio = buildDioClient(CookieJar(), onSessionExpired: () => expired++);
        dio.httpClientAdapter = adapter;

        await expectLater(
          dio.get<dynamic>('/me/profile'),
          throwsA(isA<DioException>()),
        );
        expect(expired, 0, reason: 'the session may still be perfectly valid');
      },
    );

    test(
      'a multipart body survives the retry — the first attempt consumes the '
      'stream, so replaying it uploaded nothing',
      () async {
        final lengths = <int>[];

        final adapter = _FakeAdapter((options) async {
          if (options.path == '/auth/refresh') return _json(200);
          // Record how much body each attempt actually carries.
          final data = options.data;
          lengths.add(data is FormData ? data.length : -1);
          return _json(options.extra['cq_retried'] == true ? 200 : 401);
        });

        final dio = buildDioClient(CookieJar());
        dio.httpClientAdapter = adapter;

        await dio.post<dynamic>(
          '/me/resume',
          data: FormData.fromMap({'file': 'x' * 64}),
        );

        expect(lengths.length, 2, reason: 'one 401 then one retry');
        expect(
          lengths[1],
          lengths[0],
          reason: 'the retry must carry the same body, not an emptied stream',
        );
        expect(lengths[1], greaterThan(0));
      },
    );

    test('the auth endpoints themselves never trigger a refresh', () async {
      var refreshes = 0;

      final adapter = _FakeAdapter((options) async {
        if (options.path == '/auth/refresh') refreshes++;
        return _json(401);
      });

      final dio = buildDioClient(CookieJar());
      dio.httpClientAdapter = adapter;

      await expectLater(
        dio.post<dynamic>('/auth/login'),
        throwsA(isA<DioException>()),
      );
      expect(refreshes, 0, reason: 'a bad password must not loop the refresher');
    });
  });
}
