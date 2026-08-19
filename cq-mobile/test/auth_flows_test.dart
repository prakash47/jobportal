import 'dart:typed_data';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:cq_mobile/core/config/app_config.dart';
import 'package:cq_mobile/core/network/dio_client.dart';
import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// The front door: sign in, sign up, and "I forgot my password".
///
/// Two things about it are easy to break and impossible to notice from inside
/// the app.
///
/// **The prefix.** The API versions its newer surfaces by URI — reports live at
/// `/v1/reports`, the token-based mobile surface at `/v1/auth/mobile` — but the
/// session routes are `@Controller('auth')` under `defaultVersion:
/// VERSION_NEUTRAL`, i.e. `/auth/login`, no `/v1`. Nest answers an unmatched
/// route with a 404, and every method here funnels a 404 into the same
/// human-friendly apology as a real failure, so mis-prefixing the login route
/// would ship as "Could not sign you in. Please try again." on every attempt,
/// forever, with nothing in the app pointing at the URL.
///
/// **The sequence.** The reset is three calls — request a code, spend the code
/// for a one-time ticket, spend the ticket for a new password. The code is
/// verified once and never travels again; step 3 must send the *ticket* step 2
/// minted. Re-sending the code instead still looks like a POST with a string in
/// it, and only the server can tell the difference.
///
/// Everything below drives the real repository over a real Dio, because the
/// interesting failures live in the wiring between them, not in the repository's
/// own arithmetic.

// ── Fixtures ──────────────────────────────────────────────────────────────

const _userJson =
    '{"id":11,"email":"priya@example.com","name":"Priya",'
    '"role":"CANDIDATE","emailVerified":false,"phone":null}';

/// A superset of every field any `/auth/*` parser reads, so one canned response
/// serves all of them.
final _anyAuthResponse = <String, dynamic>{
  'user': <String, dynamic>{
    'id': 11,
    'email': 'priya@example.com',
    'name': 'Priya',
    'role': 'CANDIDATE',
    'emailVerified': false,
    'phone': null,
  },
  'ticket': 'rt_9f3c8a',
  'resendInSeconds': 45,
  'expiresInSeconds': 900,
};

// ── Seam 1: record the shape of the request, answer everything ────────────

class _Recorder extends Interceptor {
  final List<RequestOptions> requests = [];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    requests.add(options);
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: _anyAuthResponse,
      ),
    );
  }
}

// ── Seam 2: script a whole flow, in order, with a chosen failure point ────

class _Server extends Interceptor {
  _Server({this.failPath});

  /// Reject this path with a 400 carrying the server's own wording.
  final String? failPath;

  final List<String> calls = [];
  final List<Object?> bodies = [];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    calls.add('${options.method} ${options.path}');
    bodies.add(options.data);

    if (options.path == failPath) {
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: 400,
            data: const {'message': 'That code is incorrect. 2 attempts left.'},
          ),
        ),
      );
      return;
    }
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: _anyAuthResponse,
      ),
    );
  }
}

// ── Seam 3: choose the status code, keep the real Dio pipeline ────────────

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions o) respond;

  final List<RequestOptions> calls = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    calls.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _body(
  String json,
  int status, {
  List<String> setCookie = const [],
}) => ResponseBody.fromString(json, status, headers: {
  Headers.contentTypeHeader: [Headers.jsonContentType],
  if (setCookie.isNotEmpty) 'set-cookie': setCookie,
});

AuthRepository _repo(Future<ResponseBody> Function(RequestOptions) respond) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = _Adapter(respond);
  return AuthRepository(dio);
}

/// The message a caller would actually put on screen.
Future<String> _messageFrom(Future<void> Function() call) async {
  try {
    await call();
  } on AuthException catch (e) {
    return e.message;
  }
  return '<no exception>';
}

void main() {
  group('the /auth/* surface is version-NEUTRAL', () {
    late Dio dio;
    late _Recorder rec;
    late AuthRepository repo;

    setUp(() {
      dio = Dio();
      rec = _Recorder();
      dio.interceptors.add(rec);
      repo = AuthRepository(dio);
    });

    test('login posts to /auth/login', () async {
      await repo.login(email: 'priya@example.com', password: 'hunter2!');

      expect(rec.requests.single.method, 'POST');
      expect(rec.requests.single.path, '/auth/login');
    });

    test('register posts to /auth/register', () async {
      await repo.register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!',
      );

      expect(rec.requests.single.method, 'POST');
      expect(rec.requests.single.path, '/auth/register');
    });

    test('the reset trio posts to forgot-password / verify-reset-otp / '
        'reset-password', () async {
      await repo.requestPasswordResetOtp('priya@example.com');
      await repo.verifyResetOtp(email: 'priya@example.com', code: '123456');
      await repo.resetPassword(ticket: 'rt_9f3c8a', password: 'hunter2!');

      expect(rec.requests.map((r) => '${r.method} ${r.path}'), [
        'POST /auth/forgot-password',
        'POST /auth/verify-reset-otp',
        'POST /auth/reset-password',
      ]);
    });

    test('the session routes are me / logout / resend-verification', () async {
      await repo.probeSession();
      await repo.logout();
      await repo.resendVerification();

      expect(rec.requests.map((r) => '${r.method} ${r.path}'), [
        'GET /auth/me',
        'POST /auth/logout',
        'POST /auth/resend-verification',
      ]);
    });

    test('not one auth route carries a /v1 prefix', () async {
      // The backend mounts these with @Controller('auth') while main.ts sets
      // defaultVersion: VERSION_NEUTRAL, so they sit at the root — unlike
      // @Controller({path: 'reports', version: '1'}) which is /v1/reports.
      // A stray /v1 here is a 404, and a 404 reads to the user as a wrong
      // password, so nothing in the app would ever point at the URL.
      await repo.login(email: 'a@b.com', password: 'x');
      await repo.register(name: 'A', email: 'a@b.com', password: 'x');
      await repo.requestPasswordResetOtp('a@b.com');
      await repo.verifyResetOtp(email: 'a@b.com', code: '123456');
      await repo.resetPassword(ticket: 't', password: 'x');
      await repo.resendVerification();
      await repo.probeSession();
      await repo.logout();

      for (final req in rec.requests) {
        expect(req.path, startsWith('/auth/'));
        expect(req.path, isNot(contains('/v1')));
      }
      expect(rec.requests, hasLength(8));
    });
  });

  group('request bodies', () {
    late Dio dio;
    late _Recorder rec;
    late AuthRepository repo;

    setUp(() {
      dio = Dio();
      rec = _Recorder();
      dio.interceptors.add(rec);
      repo = AuthRepository(dio);
    });

    test('login sends exactly email + password', () async {
      await repo.login(email: 'priya@example.com', password: 'hunter2!');

      expect(rec.requests.single.data, {
        'email': 'priya@example.com',
        'password': 'hunter2!',
      });
    });

    test('register omits phone entirely when the field was left blank',
        () async {
      // RegisterScreen passes `_phone.text.trim()`, which is '' for the
      // majority who skip the optional field. The DTO is
      // `phone: z.string().min(7).optional()` — sending '' is a 400, and a 400
      // here surfaces as "Please check your details and try again." on a form
      // where nothing is wrong.
      await repo.register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!',
        phone: '',
      );

      expect(rec.requests.single.data, {
        'name': 'Priya',
        'email': 'priya@example.com',
        'password': 'hunter2!',
      });
    });

    test('register omits phone when it is null', () async {
      await repo.register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!',
      );

      expect((rec.requests.single.data as Map).containsKey('phone'), isFalse);
    });

    test('register sends phone when the candidate typed one', () async {
      await repo.register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!',
        phone: '9876543210',
      );

      expect(rec.requests.single.data, {
        'name': 'Priya',
        'email': 'priya@example.com',
        'password': 'hunter2!',
        'phone': '9876543210',
      });
    });

    test('the reset steps send email, then email+code, then ticket+password',
        () async {
      await repo.requestPasswordResetOtp('priya@example.com');
      await repo.verifyResetOtp(email: 'priya@example.com', code: '480915');
      await repo.resetPassword(ticket: 'rt_9f3c8a', password: 'hunter2!');

      expect(rec.requests[0].data, {'email': 'priya@example.com'});
      expect(rec.requests[1].data, {
        'email': 'priya@example.com',
        'code': '480915',
      });
      expect(rec.requests[2].data, {
        'ticket': 'rt_9f3c8a',
        'password': 'hunter2!',
      });
    });

    test('resend-verification sends no body — the JWT is the whole request',
        () async {
      await repo.resendVerification();

      expect(rec.requests.single.data, isNull);
    });
  });

  group('parsing the success responses', () {
    test('login returns the user the server vouched for', () async {
      final repo = _repo((_) async => _body('{"user":$_userJson}', 200));

      final user = await repo.login(
        email: 'priya@example.com',
        password: 'hunter2!',
      );

      expect(user.id, 11);
      expect(user.email, 'priya@example.com');
      expect(user.role, 'CANDIDATE');
      expect(user.emailVerified, isFalse);
    });

    test('register returns the freshly created user', () async {
      final repo = _repo((_) async => _body('{"user":$_userJson}', 201));

      final user = await repo.register(
        name: 'Priya',
        email: 'priya@example.com',
        password: 'hunter2!',
      );

      expect(user.name, 'Priya');
    });

    test('a 200 with no user is a failure, not a signed-in null', () async {
      final repo = _repo((_) async => _body('{"ok":true}', 200));

      expect(
        await _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'x'),
        ),
        'Unexpected response from the server.',
      );
    });

    test('forgot-password carries the server clock for the resend countdown',
        () async {
      final repo = _repo(
        (_) async => _body('{"resendInSeconds":45,"expiresInSeconds":900}', 200),
      );

      final challenge = await repo.requestPasswordResetOtp('priya@example.com');

      expect(challenge.resendInSeconds, 45);
      expect(challenge.expiresInSeconds, 900);
    });

    test('a challenge with no timings falls back to 30s / 10min, never 0',
        () async {
      // 0 would enable the resend button instantly and let the form hammer an
      // endpoint the server throttles at 3/min.
      final repo = _repo((_) async => _body('{}', 200));

      final challenge = await repo.requestPasswordResetOtp('priya@example.com');

      expect(challenge.resendInSeconds, 30);
      expect(challenge.expiresInSeconds, 600);
    });

    test('an address the server has never seen takes the same success path as '
        'a known one', () async {
      // requestCode synthesises timings for an unknown address rather than
      // admitting nothing was sent, so both cases arrive as an ordinary 200 of
      // the same shape. The client's whole job is to add no branch of its own:
      // treating "no code was really sent" as a failure here would rebuild the
      // account-existence oracle the server goes out of its way to avoid.
      //
      // What is asserted is the PATH, not the numbers. 30/600 are also the
      // client's own fallbacks, so asserting them back would pass even with the
      // body parse deleted — the 45/900 test above is what pins the parse.
      final repo = _repo(
        (_) async => _body('{"resendInSeconds":30,"expiresInSeconds":600}', 200),
      );

      expect(
        await _messageFrom(
          () => repo.requestPasswordResetOtp('nobody@example.com'),
        ),
        '<no exception>',
      );
    });

    test('verify-reset-otp hands back the ticket step 3 spends', () async {
      final repo = _repo((_) async => _body('{"ticket":"rt_9f3c8a"}', 200));

      expect(
        await repo.verifyResetOtp(email: 'a@b.com', code: '480915'),
        'rt_9f3c8a',
      );
    });

    test('a 200 with an empty ticket is refused rather than carried forward',
        () async {
      // An empty ticket would sail into step 3 and come back as "That reset
      // session expired", sending the user round the whole flow again.
      final repo = _repo((_) async => _body('{"ticket":""}', 200));

      expect(
        await _messageFrom(
          () => repo.verifyResetOtp(email: 'a@b.com', code: '480915'),
        ),
        'Unexpected response from the server.',
      );
    });
  });

  group('what the user is told when it fails', () {
    test('401 on login is a wrong password, said plainly', () async {
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 401,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 401,
            data: const {'message': 'Invalid email or password'},
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'wrong'),
        ),
        'Incorrect email or password.',
      );
    });

    test('409 on register names the real problem — the email is taken',
        () async {
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 409,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 409,
            data: const {'message': 'Email already registered'},
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.register(
            name: 'Priya',
            email: 'taken@example.com',
            password: 'hunter2!',
          ),
        ),
        'An account with this email already exists.',
      );
    });

    test('a 400 names the field the server rejected', () async {
      // AuthRepository used to answer a 400 from the status code alone, so the
      // DTO's own sentence never reached the user -- on the one screen where
      // they have the least context: six inputs and no clue which was wrong.
      // It now defers to the server for 400, as every other repository does.
      // Zod's issues arrive as [{path, message}], not as a sentence, which is
      // why the field name has to be rebuilt from the path.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 400,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 400,
            data: const {
              'statusCode': 400,
              'message': [
                {
                  'path': ['password'],
                  'message': 'Password must be 8+ chars and include at least '
                      'one digit and one special character',
                },
              ],
            },
          ),
        ),
      );

      final msg = await _messageFrom(
        () => repo.register(
          name: 'Priya',
          email: 'priya@example.com',
          password: 'short',
        ),
      );

      expect(msg, 'Password: Password must be 8+ chars and include at least '
          'one digit and one special character');
    });

    test('a 429 quotes the real lock-out instead of a guessed minute',
        () async {
      // PerEmailThrottleGuard blocks this email for WINDOW_SECONDS = 3600 after
      // 10 failures and sets Retry-After to the lock's remaining TTL. The app
      // used to answer 'wait a minute' regardless, which sent a locked-out
      // candidate into a retry loop that could not succeed and re-tripped the
      // guard on every attempt.
      Future<String> messageWith(Map<String, List<String>> headers) {
        final repo = _repo(
          (o) async => throw DioException.badResponse(
            statusCode: 429,
            requestOptions: o,
            response: Response<dynamic>(
              requestOptions: o,
              statusCode: 429,
              headers: Headers.fromMap(headers),
              data: const {
                'message': 'Too many login attempts for this email — '
                    'try again later',
              },
            ),
          ),
        );
        return _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'wrong'),
        );
      }

      // 52 minutes left on an hour-long lock.
      expect(await messageWith({'retry-after': ['3120']}),
          'Too many attempts. Try again in 52 minutes.');
      // Rounded, not exact: a candidate needs to know coffee or tomorrow.
      expect(await messageWith({'retry-after': ['3600']}),
          'Too many attempts. Try again in an hour.');
      expect(await messageWith({'retry-after': ['45']}),
          'Too many attempts. Try again in a minute.');
      // No header — the global ThrottlerGuard sends none — so the server's own
      // sentence is used rather than a wait the app would be inventing.
      expect(await messageWith(const {}),
          'Too many login attempts for this email — try again later');
    });

    test('a 403 has no mapping at all and lands on the generic apology',
        () async {
      // AuthService.assertSessionAllowed 403s a deactivated recruiter with a
      // sentence explaining what to do. /auth/login is role-agnostic, so that
      // account can reach this screen. Reported.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 403,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 403,
            data: const {
              'message': 'This recruiter account has been deactivated. '
                  'Contact your team administrator.',
            },
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'right'),
        ),
        'Could not sign you in. Please try again.',
      );
    });

    test('a 500 does not claim the password was wrong', () async {
      // The distinction matters: "incorrect password" sends the user to the
      // reset flow, which cannot fix a broken server.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 500,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 500,
            data: const {'message': 'Internal server error'},
          ),
        ),
      );

      final msg = await _messageFrom(
        () => repo.login(email: 'a@b.com', password: 'right'),
      );

      expect(msg, 'Could not sign you in. Please try again.');
      expect(msg, isNot(contains('Incorrect')));
    });

    test('an unreachable server blames the connection, not the credentials',
        () async {
      final repo = _repo(
        (o) async => throw DioException.connectionError(
          requestOptions: o,
          reason: 'no network',
        ),
      );

      expect(
        await _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'right'),
        ),
        "Can't reach the server. Please check your connection and try again.",
      );
    });

    test('a timeout is called a timeout', () async {
      final repo = _repo(
        (o) async => throw DioException.receiveTimeout(
          timeout: const Duration(seconds: 1),
          requestOptions: o,
        ),
      );

      expect(
        await _messageFrom(
          () => repo.login(email: 'a@b.com', password: 'right'),
        ),
        'The server took too long to respond. Please try again.',
      );
    });

    test('forgot-password 503 explains that email is switched off', () async {
      // killswitch.transactional_emails is on — no code is coming, so telling
      // the user to check their inbox would be a lie.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 503,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 503,
            data: const {'message': 'Email is temporarily unavailable.'},
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.requestPasswordResetOtp('priya@example.com'),
        ),
        'Password reset is temporarily unavailable. Please try again later.',
      );
    });

    test('a wrong code says so instead of "check your details"', () async {
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 400,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 400,
            data: const {
              'message': 'That code is incorrect. 2 attempts left.',
            },
          ),
        ),
      );

      final msg = await _messageFrom(
        () => repo.verifyResetOtp(email: 'a@b.com', code: '000000'),
      );

      // The countdown is the point: there are only five guesses, and a user
      // who cannot see them left retypes until the code dies.
      expect(msg, 'That code is incorrect. 2 attempts left.');
    });

    test('running out of code attempts says the code is now dead',
        () async {
      // 'Too many incorrect attempts. Request a new code.' is the one message
      // that tells the user the code in their hand is now dead. Collapsing it
      // into the generic line leaves them retyping it. Reported.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 400,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 400,
            data: const {
              'message': 'Too many incorrect attempts. Request a new code.',
            },
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.verifyResetOtp(email: 'a@b.com', code: '111111'),
        ),
        'Too many incorrect attempts. Request a new code.',
      );
    });

    test('reset-password 400 says which of the two things went wrong', () async {
      // Two different server 400s land here: the expired/spent ticket AND a
      // password that fails the strength rule. The second is told to start the
      // whole flow again, which cannot help. Reported.
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 400,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 400,
            data: const {
              'message': 'Password must be at least 8 characters and include '
                  'a number and a special character.',
            },
          ),
        ),
      );

      expect(
        await _messageFrom(
          () => repo.resetPassword(ticket: 'rt_9f3c8a', password: 'abcdefgh'),
        ),
        'Password must be at least 8 characters and include a number '
        'and a special character.',
      );
    });

    test('resend-verification names the one-per-minute throttle', () async {
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 429,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 429,
            data: const {'message': 'Too many requests'},
          ),
        ),
      );

      expect(
        await _messageFrom(repo.resendVerification),
        'An email was just sent. Please wait a minute before asking again.',
      );
    });

    test('resend-verification 503 does not promise an email that is off',
        () async {
      final repo = _repo(
        (o) async => throw DioException.badResponse(
          statusCode: 503,
          requestOptions: o,
          response: Response<dynamic>(
            requestOptions: o,
            statusCode: 503,
            data: const {'message': 'Email is temporarily unavailable.'},
          ),
        ),
      );

      expect(
        await _messageFrom(repo.resendVerification),
        'Sending email is unavailable right now. Please try again later.',
      );
    });

    test('logout never throws, however badly the revoke goes', () async {
      // AuthController awaits this before wiping the device. A throw here would
      // skip the local cookie wipe and leave a live 30-day credential behind.
      final repo = _repo(
        (o) async => throw DioException.connectionError(
          requestOptions: o,
          reason: 'no network',
        ),
      );

      await expectLater(repo.logout(), completes);
    });
  });

  group('the reset flow, end to end', () {
    test('request → ticket → complete, in that order, and step 3 spends the '
        'TICKET rather than the code', () async {
      final server = _Server();
      final repo = AuthRepository(Dio()..interceptors.add(server));

      final challenge = await repo.requestPasswordResetOtp('priya@example.com');
      final ticket = await repo.verifyResetOtp(
        email: 'priya@example.com',
        code: '480915',
      );
      final user = await repo.resetPassword(
        ticket: ticket,
        password: 'newpass1!',
      );

      expect(server.calls, [
        'POST /auth/forgot-password',
        'POST /auth/verify-reset-otp',
        'POST /auth/reset-password',
      ]);
      expect(challenge.resendInSeconds, 45);

      final finalBody = server.bodies.last as Map<String, dynamic>;
      expect(finalBody['ticket'], ticket);
      // The 6-digit code is verified exactly once and must never travel again.
      expect(finalBody.containsKey('code'), isFalse);
      expect(finalBody['password'], 'newpass1!');

      // Step 3 answers with the user because the response also sets fresh
      // session cookies — the reset ends signed in.
      expect(user.email, 'priya@example.com');
    });

    test('a rejected code produces an exception instead of a ticket, and is '
        'not retried behind the user\'s back', () async {
      // The step-gating itself lives in ForgotPasswordScreen — `_ticket` is
      // assigned only on success and `_reset()` spends `_ticket!` — which needs
      // a GoRouter above it to drive, so this pins the repository's half: a
      // refused code comes back as the message the form puts on screen, never
      // as a value step 3 could spend.
      final server = _Server(failPath: '/auth/verify-reset-otp');
      final repo = AuthRepository(Dio()..interceptors.add(server));

      await repo.requestPasswordResetOtp('priya@example.com');
      expect(
        await _messageFrom(
          () => repo.verifyResetOtp(email: 'priya@example.com', code: '000000'),
        ),
        'That code is incorrect. 2 attempts left.',
      );

      expect(
        server.calls,
        ['POST /auth/forgot-password', 'POST /auth/verify-reset-otp'],
        reason: 'the server allows five guesses in total, so an automatic '
            'retry would silently spend two of them per typo',
      );
    });
  });

  group('a successful sign-in is what stores the session', () {
    // The credential is the cookie jar, not any field in the JSON body — the
    // API returns HttpOnly access_token/refresh_token and nothing else. These
    // drive the production buildDioClient so CookieManager is really in the
    // chain.

    test('login banks the session cookies and replays them on the next request',
        () async {
      final jar = CookieJar();
      final adapter = _Adapter((o) async {
        if (o.path == '/auth/login') {
          return _body('{"user":$_userJson}', 200, setCookie: const [
            'access_token=at_live; Path=/; HttpOnly',
            'refresh_token=rt_live; Path=/; HttpOnly',
          ]);
        }
        return _body('{}', 200);
      });
      final dio = buildDioClient(jar)..httpClientAdapter = adapter;

      await AuthRepository(dio).login(
        email: 'priya@example.com',
        password: 'hunter2!',
      );
      await dio.get<dynamic>('/me/saved-jobs');

      final replayed = adapter.calls.last.headers['cookie'] as String?;
      expect(replayed, isNotNull,
          reason: 'without this the user is signed out on the next screen');
      expect(replayed, contains('access_token=at_live'));
      expect(replayed, contains('refresh_token=rt_live'));
    });

    test('a mistyped password banks nothing and disturbs nothing already '
        'banked', () async {
      // An earlier version of this asserted an EMPTY jar after the 401 — which
      // is what you get from any 401 that carries no Set-Cookie, wired cookie
      // layer or not (it stayed green with CookieManager deleted from
      // buildDioClient). The failure worth guarding is the other direction: the
      // jar IS the credential, and CookieManager saves Set-Cookie off error
      // responses too, so a refused attempt must add nothing of its own and
      // leave an existing session exactly where it was.
      final base = Uri.parse('${AppConfig.apiBaseUrl}/');
      final jar = CookieJar();
      await jar.saveFromResponse(base, [
        Cookie('access_token', 'at_live')..path = '/',
        Cookie('refresh_token', 'rt_live')..path = '/',
      ]);

      final adapter = _Adapter(
        (o) async => o.path == '/auth/login'
            ? _body('{"message":"Invalid email or password"}', 401)
            : _body('{}', 200),
      );
      final dio = buildDioClient(jar)..httpClientAdapter = adapter;

      await expectLater(
        AuthRepository(dio).login(email: 'a@b.com', password: 'wrong'),
        throwsA(isA<AuthException>()),
      );
      await dio.get<dynamic>('/me/saved-jobs');

      expect(
        (await jar.loadForRequest(base)).map((c) => '${c.name}=${c.value}'),
        unorderedEquals(
          <String>['access_token=at_live', 'refresh_token=rt_live'],
        ),
        reason: 'a refused credential must neither add a session nor drop one',
      );
      expect(
        adapter.calls.last.headers['cookie'],
        contains('access_token=at_live'),
        reason: 'one wrong password must not sign the device out',
      );
    });

    test('a 401 from login is not a session expiry — no refresh, no sign-out '
        'signal', () async {
      // /auth/login is on the interceptor's exempt list. If it were not, typing
      // the wrong password would POST /auth/refresh, get another 401, and fire
      // onSessionExpired — which clears the cookie jar and the cached identity
      // of whoever is already signed in on the device.
      var expired = 0;
      final adapter = _Adapter((_) async => _body('{}', 401));
      final dio = buildDioClient(CookieJar(), onSessionExpired: () => expired++)
        ..httpClientAdapter = adapter;

      await expectLater(
        AuthRepository(dio).login(email: 'a@b.com', password: 'wrong'),
        throwsA(isA<AuthException>()),
      );

      expect(adapter.calls.map((c) => c.path), ['/auth/login']);
      expect(expired, 0);
    });

    test('a 401 from register is exempt too', () async {
      var expired = 0;
      final adapter = _Adapter((_) async => _body('{}', 401));
      final dio = buildDioClient(CookieJar(), onSessionExpired: () => expired++)
        ..httpClientAdapter = adapter;

      await expectLater(
        AuthRepository(dio).register(
          name: 'Priya',
          email: 'a@b.com',
          password: 'hunter2!',
        ),
        throwsA(isA<AuthException>()),
      );

      expect(adapter.calls.map((c) => c.path), ['/auth/register']);
      expect(expired, 0);
    });
  });

  group('the controller only flips to signed-in on a real success', () {
    ProviderContainer containerFor(_Adapter adapter) {
      // dioProvider alone is enough here: login never reaches
      // cookieJarProvider (which would need path_provider), and SessionCache
      // swallows its own keystore failures.
      //
      // Reading the notifier starts AuthController.build() → _restoreSession(),
      // which parks on AppBoot.firstFrame — a Completer only a real painted
      // frame completes — so it can never overwrite the state these tests set.
      // Anything added to this file that completes AppBoot.firstFrame would
      // release every parked restore at once and flip these to unauthenticated
      // 2.9s later, which is the shape a flaky suite takes.
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
        ..httpClientAdapter = adapter;
      final container = ProviderContainer(
        overrides: [dioProvider.overrideWith((ref) async => dio)],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('a good password publishes the user the router sends home', () async {
      final container = containerFor(_Adapter(
        (o) async => o.path == '/auth/login'
            ? _body('{"user":$_userJson}', 200)
            : _body('{}', 401), // the launch probe: no session yet
      ));

      await container.read(authControllerProvider.notifier).login(
            email: 'priya@example.com',
            password: 'hunter2!',
          );

      final state = container.read(authControllerProvider);
      expect(state, isA<AuthAuthenticated>());
      expect((state as AuthAuthenticated).user.email, 'priya@example.com');
      expect(
        state.justRegistered,
        isFalse,
        reason: 'only registration routes into the onboarding wizard',
      );
    });

    test('registration flags justRegistered so onboarding runs once', () async {
      final container = containerFor(_Adapter(
        (o) async => o.path == '/auth/register'
            ? _body('{"user":$_userJson}', 201)
            : _body('{}', 401),
      ));

      await container.read(authControllerProvider.notifier).register(
            name: 'Priya',
            email: 'priya@example.com',
            password: 'hunter2!',
          );

      final state = container.read(authControllerProvider);
      expect(state, isA<AuthAuthenticated>());
      expect((state as AuthAuthenticated).justRegistered, isTrue);
    });

    test('a rejected login leaves the app signed out and rethrows for the form',
        () async {
      final container = containerFor(_Adapter((_) async => _body('{}', 401)));

      await expectLater(
        container.read(authControllerProvider.notifier).login(
              email: 'a@b.com',
              password: 'wrong',
            ),
        throwsA(isA<AuthException>()),
      );

      expect(
        container.read(authControllerProvider),
        isNot(isA<AuthAuthenticated>()),
        reason: 'a refused credential must never produce a signed-in shell',
      );
    });

    test('completePasswordReset signs the user in, because step 3 already set '
        'the cookies', () async {
      final container = containerFor(_Adapter((_) async => _body('{}', 401)));
      final repo = _repo((_) async => _body('{"user":$_userJson}', 200));

      final user = await repo.resetPassword(
        ticket: 'rt_9f3c8a',
        password: 'newpass1!',
      );
      container
          .read(authControllerProvider.notifier)
          .completePasswordReset(user);

      final state = container.read(authControllerProvider);
      expect(state, isA<AuthAuthenticated>());
      expect((state as AuthAuthenticated).user.id, 11);
      expect(
        state.justRegistered,
        isFalse,
        reason: 'an existing account must not be pushed through onboarding',
      );
    });
  });
}
