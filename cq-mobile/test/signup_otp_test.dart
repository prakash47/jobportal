import 'dart:convert';

import 'package:cq_mobile/features/auth/data/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Signing up is two steps as of the website's signup-OTP work: the server
/// emails a 6-digit code and refuses to create a `User` row for an address it
/// has not just verified.
///
/// This is not a nicety the app could skip. `POST /auth/register` now requires
/// a `signupId`, so the previous one-shot registration — name, email, password
/// — is a 400 on every attempt. The app had no idea, because the backend note
/// recording the change assumed the app was on `/v1/auth/mobile/register`,
/// which it has never used.
///
/// These drive the real Dio stack so the paths, the bodies and the split
/// surface are all pinned: `/auth/*` is version-NEUTRAL, and a stray `/v1`
/// would be a 404 that the app reports as an ordinary failure.
class _Api implements HttpClientAdapter {
  _Api(this.reply);

  /// path → (status, body)
  final (int, String) Function(RequestOptions) reply;

  final List<RequestOptions> seen = [];
  final List<String> _bodies = [];

  RequestOptions get last => seen.last;
  List<String> get calls => [for (final r in seen) '${r.method} ${r.path}'];

  /// Decoded off the bytes actually sent, not off the map handed to Dio, so a
  /// key lost on the way out is visible here.
  Map<String, dynamic> bodyOf(int i) =>
      jsonDecode(_bodies[i]) as Map<String, dynamic>;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    final chunks = requestStream == null
        ? const <int>[]
        : (await requestStream.toList()).expand((c) => c).toList();
    _bodies.add(utf8.decode(chunks));
    final (status, body) = reply(options);
    return ResponseBody.fromString(
      body,
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

AuthRepository _repo(_Api api) => AuthRepository(
  Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = api,
);

const _ok = '{"signupId":"sid_123","resendInSeconds":30,'
    '"expiresAt":"2026-08-22T10:10:00.000Z"}';

void main() {
  group('requesting a code', () {
    test('posts to the version-neutral route with name and email', () async {
      final api = _Api((_) => (202, _ok));
      final challenge = await _repo(api)
          .requestSignupOtp(name: 'Priya', email: 'priya@example.com');

      expect(api.calls, ['POST /auth/signup/otp/request']);
      expect(api.last.path, isNot(contains('/v1')));
      // signupId is omitted on a FIRST request — the DTO is .strict(), and the
      // server opens a new challenge when it is absent.
      expect(api.bodyOf(0), {'name': 'Priya', 'email': 'priya@example.com'});
      expect(challenge.signupId, 'sid_123');
      expect(challenge.resendInSeconds, 30);
    });

    test('a resend echoes the same signupId back', () async {
      // Without it the server opens a SECOND challenge for one address, and the
      // code the user is looking at stops being the one that counts.
      final api = _Api((_) => (202, _ok));
      await _repo(api).requestSignupOtp(
        name: 'Priya',
        email: 'priya@example.com',
        signupId: 'sid_123',
      );

      expect(api.bodyOf(0)['signupId'], 'sid_123');
    });

    test('a cooldown 429 carries the seconds, not just a sentence', () async {
      // The button has to re-arm at the right moment. Flattening this to a
      // string leaves the client guessing, which is what the server sends
      // resendInSeconds to prevent.
      final api = _Api(
        (_) => (
          429,
          '{"statusCode":429,"message":"Please wait 18s before requesting '
              'another code.","resendInSeconds":18}',
        ),
      );

      await expectLater(
        _repo(api).requestSignupOtp(name: 'P', email: 'p@example.com'),
        throwsA(
          isA<AuthException>()
              .having((e) => e.resendInSeconds, 'resendInSeconds', 18)
              .having((e) => e.message, 'message', contains('18s')),
        ),
      );
    });

    test('resendInSeconds is a duration, and a missing one is not zero', () {
      // Zero would mean "resend is available now" and re-arm the button
      // immediately, hammering an endpoint throttled at 5/min.
      final c = SignupChallenge.fromJson(const {'signupId': 'x'});
      expect(c.resendInSeconds, 30);
    });
  });

  group('verifying the code', () {
    test('posts the challenge and the code, nothing else', () async {
      final api = _Api((_) => (200, '{"verified":true}'));
      await _repo(api).verifySignupOtp(signupId: 'sid_123', code: '048213');

      expect(api.calls, ['POST /auth/signup/otp/verify']);
      // The DTO is .strict(); an extra key is a 400.
      expect(api.bodyOf(0), {'signupId': 'sid_123', 'code': '048213'});
    });

    test('a leading zero survives — the code is a string, never a number',
        () async {
      final api = _Api((_) => (200, '{"verified":true}'));
      await _repo(api).verifySignupOtp(signupId: 'sid_123', code: '004821');
      expect(api.bodyOf(0)['code'], '004821');
    });

    test('the server\'s own sentence reaches the user', () async {
      // Each of these needs a different move — try again, request a new code,
      // start over — so collapsing them into one line strands the user.
      for (final message in const [
        'That code is incorrect. 2 attempts left.',
        'That code has expired. Request a new one.',
        'Too many incorrect attempts. Request a new code.',
      ]) {
        final api = _Api(
          (_) => (400, jsonEncode({'statusCode': 400, 'message': message})),
        );
        await expectLater(
          _repo(api).verifySignupOtp(signupId: 'sid', code: '000000'),
          throwsA(isA<AuthException>().having((e) => e.message, 'message', message)),
        );
      }
    });
  });

  group('creating the account', () {
    test('register carries the verified signupId', () async {
      // The whole point of the two steps: without this key the server refuses
      // to create the row, and the app spent this session unable to register
      // anyone because it was not sending it.
      final api = _Api(
        (_) => (
          201,
          '{"user":{"id":1,"email":"priya@example.com","name":"Priya",'
              '"role":"CANDIDATE","emailVerified":true}}',
        ),
      );

      final user = await _repo(api).register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!x',
        signupId: 'sid_123',
      );

      expect(api.calls, ['POST /auth/register']);
      expect(api.bodyOf(0)['signupId'], 'sid_123');
      expect(user.emailVerified, isTrue);
    });

    test('an unverified handle is refused in the server\'s words', () async {
      final api = _Api(
        (_) => (
          400,
          '{"statusCode":400,"message":"Verify your email address before '
              'creating your account."}',
        ),
      );

      await expectLater(
        _repo(api).register(
          name: 'P',
          email: 'p@example.com',
          password: 'hunter2!x',
          signupId: 'never-verified',
        ),
        throwsA(
          isA<AuthException>().having(
            (e) => e.message,
            'message',
            contains('Verify your email address'),
          ),
        ),
      );
    });

    test('an omitted phone stays out of the body', () async {
      // RegisterDto has phone as min(7).optional(), so '' is a 400 on a form
      // where the user simply left it blank.
      final api = _Api(
        (_) => (201, '{"user":{"id":1,"email":"a@b.com","name":"A"}}'),
      );
      await _repo(api).register(
        name: 'A',
        email: 'a@b.com',
        password: 'hunter2!x',
        signupId: 'sid',
        phone: '',
      );
      expect(api.bodyOf(0).containsKey('phone'), isFalse);
    });
  });
}
