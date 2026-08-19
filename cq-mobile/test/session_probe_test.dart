import 'dart:typed_data';

import 'package:cq_mobile/features/auth/data/auth_repository.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Guards the fix for "opening the app with no signal logs you out".
///
/// The old `currentUser()` caught every DioException and returned null, so
/// "signed out" and "server unreachable" were indistinguishable to the caller
/// and both ended at the welcome screen — discarding a valid 30-day session.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions o) respond;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => respond(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _body(String json, int status) =>
    ResponseBody.fromString(json, status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

AuthRepository _repo(Future<ResponseBody> Function(RequestOptions) respond) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.httpClientAdapter = _Adapter(respond);
  return AuthRepository(dio);
}

void main() {
  test('a live session returns SessionActive with the user', () async {
    final repo = _repo((_) async => _body(
          '{"user":{"id":7,"email":"a@b.com","name":"Priya","role":"CANDIDATE","emailVerified":true}}',
          200,
        ));

    final probe = await repo.probeSession();

    expect(probe, isA<SessionActive>());
    expect((probe as SessionActive).user.email, 'a@b.com');
  });

  test('401 means SessionNone — the server actually said "not signed in"',
      () async {
    final repo = _repo((_) async => _body('{}', 401));

    expect(await repo.probeSession(), isA<SessionNone>());
  });

  test('403 also means SessionNone', () async {
    final repo = _repo((_) async => _body('{}', 403));

    expect(await repo.probeSession(), isA<SessionNone>());
  });

  test('a connection failure is SessionUnknown, NOT signed out', () async {
    final repo = _repo((o) async {
      throw DioException.connectionError(
        requestOptions: o,
        reason: 'no network',
      );
    });

    expect(
      await repo.probeSession(),
      isA<SessionUnknown>(),
      reason: 'being offline is not evidence that the session died',
    );
  });

  test('a timeout is SessionUnknown', () async {
    final repo = _repo((o) async {
      throw DioException.receiveTimeout(
        timeout: const Duration(seconds: 1),
        requestOptions: o,
      );
    });

    expect(await repo.probeSession(), isA<SessionUnknown>());
  });

  test('a 500 is SessionUnknown — our bug is not their logout', () async {
    final repo = _repo((_) async => _body('{}', 500));

    expect(await repo.probeSession(), isA<SessionUnknown>());
  });

  test('200 with no user field is SessionNone', () async {
    final repo = _repo((_) async => _body('{}', 200));

    expect(await repo.probeSession(), isA<SessionNone>());
  });

  test('AuthUser survives a cache round-trip', () {
    const user = AuthUser(
      id: 3,
      email: 'x@y.com',
      name: 'Test',
      role: 'CANDIDATE',
      emailVerified: false,
      phone: '9999999999',
    );

    final back = AuthUser.fromJson(user.toJson());

    expect(back.id, user.id);
    expect(back.email, user.email);
    expect(back.name, user.name);
    expect(back.role, user.role);
    expect(back.emailVerified, user.emailVerified);
    expect(back.phone, user.phone);
  });
}
