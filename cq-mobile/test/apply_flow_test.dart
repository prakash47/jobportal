import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:cq_mobile/features/jobs/data/jobs_repository.dart';
import 'package:cq_mobile/features/jobs/presentation/job_detail_screen.dart';
import 'package:cq_mobile/shared/widgets/cq_buttons.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Applying is the one irreversible thing a candidate does on a job page, and
/// only its happy-path URL was pinned. Every refusal arrives as a bare HTTP
/// status that the repository has to translate before the screen can say
/// anything useful, and the screen then has to make the refusal *stick* — a
/// toast fades after four seconds, the apply bar does not.
///
/// The refusal that is genuinely easy to get wrong is 429, because the server
/// sends TWO unrelated ones on this route: the daily application quota ("come
/// back tomorrow") and the global 100/min throttle ("try again in a minute").
/// Nothing in the status distinguishes them — the tell is a top-level numeric
/// `limit` in the body, which only the quota carries. Confusing them either
/// greys out Apply until midnight UTC for a candidate who has seven
/// applications left, or tells someone genuinely out of applications to retry
/// in a minute, so they tap into the same wall repeatedly.
///
/// The second half is the failure the candidate SEES rather than the one the
/// server sent: a refused apply must never leave the bar reading "Application
/// submitted", and must never leave Apply stuck on its spinner — that spinner
/// bug already shipped once, on the resume-upload retry path.

ResponseBody _body(String json, int status) =>
    ResponseBody.fromString(json, status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

/// Answers every request through one callback, and records the calls so a
/// "did it quietly retry?" question has an answer.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);

  final Future<ResponseBody> Function(RequestOptions options) respond;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

(JobsRepository, _Adapter) _repo(
  Future<ResponseBody> Function(RequestOptions options) respond,
) {
  final adapter = _Adapter(respond);
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = adapter;
  return (JobsRepository(dio), adapter);
}

/// A server that refuses the apply with [status] and [body] verbatim.
///
/// The body goes back as real JSON bytes with a JSON content type rather than
/// as a hand-built [DioException], so Dio's own decoding runs and the
/// repository reads exactly the map a real response would hand it.
(JobsRepository, _Adapter) _refuses(int status, Map<String, dynamic> body) =>
    _repo((_) async => _body(jsonEncode(body), status));

Matcher _refusal(String message, {String? code}) => throwsA(
      isA<JobsException>()
          .having((e) => e.message, 'message', message)
          .having((e) => e.code, 'code', code),
    );

// ── Fixtures shaped like the real API ───────────────────────────────────────

/// `applications/quota.service.ts` `over()` — note `limit`, which is the ONLY
/// thing separating this from the throttle 429 below.
const _quota429 = <String, dynamic>{
  'statusCode': 429,
  'error': 'Too Many Requests',
  'count': 10,
  'limit': 10,
  'unlimited': false,
  'upgradeAvailable': false,
  'message': 'Daily application limit reached. You can apply again tomorrow.',
};

/// The global `ThrottlerGuard` (100/min, `auth.module.ts`) after the shared
/// error envelope wraps it. Same status, no `limit`.
const _throttle429 = <String, dynamic>{
  'statusCode': 429,
  'error': 'Too Many Requests',
  'message': 'ThrottlerException: Too Many Requests',
};

const _job = <String, dynamic>{
  'id': 42,
  'canonicalSlug': 'flutter-engineer-acme-42',
  'title': 'Flutter Engineer',
  'description': 'Build the Career Queue app.',
  'status': 'ACTIVE',
  'postedAt': '2026-08-01T09:00:00.000Z',
  'company': <String, dynamic>{'id': 7, 'name': 'Acme', 'slug': 'acme'},
  'cities': <String>['Bengaluru'],
  'skills': <Map<String, dynamic>>[],
};

// ── The screen under test ───────────────────────────────────────────────────

/// Serves a whole job-detail screen. Everything the screen loads on open
/// succeeds; only the apply POST is scripted to fail.
class _Server implements HttpClientAdapter {
  _Server({
    this.applyStatus = 500,
    this.applyBody = const <String, dynamic>{},
    this.applyOffline = false,
    this.quotaLimit = 10,
  });

  final int applyStatus;
  final Map<String, dynamic> applyBody;

  /// Connectivity dropped after the job was already on screen — the ordinary
  /// case, not a cold start with no network.
  final bool applyOffline;

  /// null → the quota read fails. `applyQuota()` swallows that and returns
  /// null, which is the everyday state for a candidate whose quota GET was
  /// itself rate-limited.
  final int? quotaLimit;

  int applyCalls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.path;
    if (path == '/me/applications') {
      applyCalls++;
      if (applyOffline) {
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'no network',
        );
      }
      return _body(jsonEncode(applyBody), applyStatus);
    }
    if (path == '/me/applications/quota') {
      final limit = quotaLimit;
      if (limit == null) {
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'quota unavailable',
        );
      }
      return _body(
        jsonEncode(<String, dynamic>{
          'count': 0,
          'limit': limit,
          'unlimited': false,
          'upgradeAvailable': false,
        }),
        200,
      );
    }
    if (path == '/v1/me/job-state') {
      return _body('{"saved":[],"applied":{}}', 200);
    }
    if (path.startsWith('/v1/jobs/')) {
      return _body(jsonEncode(_job), 200);
    }
    // The similar-jobs rail. Empty keeps the tree small and the rail hidden.
    return _body('{"hits":[],"total":0,"page":1,"pageSize":20}', 200);
  }

  @override
  void close({bool force = false}) {}
}

/// Pins the auth state instead of letting the real controller probe the
/// server and sit on the splash timer. A VERIFIED user is what makes the
/// generic-403 branch reachable — an unverified one is diverted into the
/// email-verification sheet before it can toast.
class _Auth extends AuthController {
  _Auth(this._pinned);
  final AuthState _pinned;

  @override
  AuthState build() => _pinned;
}

const _user = AuthUser(
  id: 1,
  email: 'asha@example.com',
  name: 'Asha',
  role: 'CANDIDATE',
  emailVerified: true,
);

Future<void> _pump(WidgetTester tester, _Server server) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = server;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWith((ref) async => dio),
        authControllerProvider.overrideWith(
          () => _Auth(const AuthAuthenticated(_user)),
        ),
      ],
      child: MaterialApp(
        // Mandatory: every widget here reads `context.cq`, the theme extension
        // CqTheme registers. A bare MaterialApp throws on the first build.
        theme: CqTheme.light,
        home: const JobDetailScreen(slug: 'flutter-engineer-acme-42'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Taps Apply and lets the POST resolve and the snackbar arrive.
///
/// Deliberately not `pumpAndSettle`: `_applying` stays true for as long as the
/// refusal is being handled, and the button's spinner schedules frames the
/// whole time — the resume prompt below holds it open indefinitely, so a
/// settle there never returns.
Future<void> _tapApply(WidgetTester tester) async {
  await tester.tap(find.text('Apply now'));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

CqPrimaryButton _applyButton(WidgetTester tester) =>
    tester.widget<CqPrimaryButton>(find.byType(CqPrimaryButton));

void main() {
  group('what the server refused', () {
    test('a second apply to the same job reads as already applied', () async {
      final (repo, _) = _refuses(409, const {
        'statusCode': 409,
        'error': 'Conflict',
        'message': 'You have already applied to this job.',
      });

      await expectLater(
        repo.apply(42),
        _refusal('You have already applied to this job.'),
      );
    });

    test('applying twice: the first succeeds, only the second is refused',
        () async {
      var posts = 0;
      final (repo, adapter) = _repo((options) async {
        posts++;
        return posts == 1
            ? _body('{"id":1,"jobId":42,"status":"APPLIED"}', 201)
            : _body(
                jsonEncode(const {'message': 'You have already applied to this job.'}),
                409,
              );
      });

      await repo.apply(42); // must not throw
      await expectLater(
        repo.apply(42),
        _refusal('You have already applied to this job.'),
      );
      expect(adapter.requests.map((r) => r.path), [
        '/me/applications',
        '/me/applications',
      ]);
    });

    test(
      'the daily quota 429 and the 100/min throttle 429 are told apart by a '
      'numeric limit, and say different things',
      () async {
        final (quotaRepo, _) = _refuses(429, _quota429);
        final (throttleRepo, _) = _refuses(429, _throttle429);

        // Only the quota carries `code`, and only `code` makes the screen grey
        // out the Apply button. Getting this backwards locks a candidate out
        // of a job for the rest of the UTC day over a one-minute throttle.
        await expectLater(
          quotaRepo.apply(42),
          _refusal(
            'Daily application limit reached. You can apply again tomorrow.',
            code: 'QUOTA_EXCEEDED',
          ),
        );
        await expectLater(
          throttleRepo.apply(42),
          // The throttler raises @nestjs/throttler's default exception, whose
          // message is the literal string 'ThrottlerException: Too Many
          // Requests'. Preferring the server here put that class name in a red
          // snackbar under the primary button, so the throttle branch now uses
          // the app's own copy. The quota branch still prefers the server,
          // whose message is real prose.
          _refusal('Too many requests just now. Please try again in a minute.'),
        );
      },
    );

    test('a quota 429 with no message falls back to our own tomorrow copy',
        () async {
      final (repo, _) = _refuses(429, const {'count': 10, 'limit': 10});

      await expectLater(
        repo.apply(42),
        _refusal(
          "You've reached today's application limit. Please try again tomorrow.",
          code: 'QUOTA_EXCEEDED',
        ),
      );
    });

    test('a throttle 429 with no message falls back to the one-minute copy',
        () async {
      final (repo, _) = _refuses(429, const {'statusCode': 429});

      await expectLater(
        repo.apply(42),
        _refusal('Too many requests just now. Please try again in a minute.'),
      );
    });

    test('a limit of zero still counts as the quota, not the throttle',
        () async {
      // `data['limit'] is num` — 0 is a num. A plan whose daily allowance is
      // zero is exactly the case where "try again in a minute" would be a lie.
      final (repo, _) = _refuses(429, const {'count': 0, 'limit': 0});

      await expectLater(
        repo.apply(42),
        _refusal(
          "You've reached today's application limit. Please try again tomorrow.",
          code: 'QUOTA_EXCEEDED',
        ),
      );
    });

    test('no resume on file keeps its code, and is reworded for a phone',
        () async {
      // The server sends this as a 403, so the code has to be read BEFORE the
      // status — a status-first branch would answer "verify your email".
      final (repo, _) = _refuses(403, const {
        'statusCode': 403,
        'message': 'Upload your resume before applying.',
        'code': 'RESUME_REQUIRED',
      });

      await expectLater(
        repo.apply(42),
        _refusal(
          'Add a resume to your profile before applying.',
          code: 'RESUME_REQUIRED',
        ),
      );
    });

    test('a resume still being scanned is a wait, not an upload', () async {
      final (repo, _) = _refuses(403, const {
        'statusCode': 403,
        'message': 'Your resume is still being scanned. Try again in a moment.',
        'code': 'RESUME_SCANNING',
      });

      // Distinct from RESUME_REQUIRED on purpose: sending this candidate to the
      // file picker would have them re-upload a CV they already have.
      await expectLater(
        repo.apply(42),
        _refusal(
          'Your resume is still being checked — please try again in a moment.',
          code: 'RESUME_SCANNING',
        ),
      );
    });

    test(
      'a code-less 403 says what the server said, not always "verify email"',
      () async {
        final (repo, _) = _refuses(403, const {
          'statusCode': 403,
          'error': 'Forbidden',
          'message': 'This job is no longer accepting applications.',
        });

        // The API raises a code-less 403 for three different reasons —
        // unverified email, a job still in moderation, and a job that just
        // closed. Mapping all three onto the email one told a candidate whose
        // email was verified to go and verify it, about a job that had simply
        // closed.
        await expectLater(
          repo.apply(42),
          _refusal(
            'This job is no longer accepting applications.',
            code: 'FORBIDDEN',
          ),
        );
      },
    );

    test('an unmapped status falls through to the shared envelope reader',
        () async {
      // 400 has no branch of its own in `apply`, so it reaches
      // `friendlyDioMessage`. That matters because the envelope's `message` is
      // not always a sentence: `BadRequestException(parsed.error.issues)` hands
      // Zod's issue LIST through untouched. The reader itself is pinned in
      // api_error_test.dart; what is asserted here is only that `apply` still
      // routes through it instead of inventing its own generic line.
      final (repo, _) = _refuses(400, const {
        'statusCode': 400,
        'error': 'Bad Request',
        'message': [
          {
            'code': 'invalid_type',
            'expected': 'number',
            'received': 'string',
            'path': ['jobId'],
            'message': 'Expected number, received string',
          },
        ],
      });

      await expectLater(
        repo.apply(42),
        _refusal('Job id: Expected number, received string'),
      );
    });

    test('an apply with no connection blames the connection', () async {
      final (repo, adapter) = _repo(
        (options) async => throw DioException.connectionError(
          requestOptions: options,
          reason: 'no network',
        ),
      );

      await expectLater(
        repo.apply(42),
        _refusal("Can't reach the server. Check your connection and try again."),
      );
      expect(adapter.requests, hasLength(1));
    });

    test('a refusal posts once, to the collection, with the id in the body',
        () async {
      final (repo, adapter) = _refuses(429, _quota429);

      await expectLater(repo.apply(42), throwsA(isA<JobsException>()));

      // The shape is the point: this route takes `{jobId}` in the BODY, unlike
      // its saved-jobs neighbour, where the same id in the body instead of the
      // path made every save 404 silently.
      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/me/applications');
      expect(adapter.requests.single.data, <String, dynamic>{'jobId': 42});
      // One attempt — but note the Dio here carries no interceptors, so this
      // only pins that `apply` itself does not loop. The retry that could
      // genuinely double-post is the 401 refresh replay in the real client,
      // and that one is pinned in session_refresh_test.dart.
      expect(adapter.requests, hasLength(1));
    });
  });

  group('what the candidate is left looking at', () {
    testWidgets('a quota refusal greys out Apply — a toast alone would fade',
        (tester) async {
      final server = _Server(applyStatus: 429, applyBody: _quota429);
      await _pump(tester, server);

      expect(find.text('10 of 10 applications left today'), findsOneWidget);

      await _tapApply(tester);

      expect(
        find.text('Daily application limit reached. You can apply again tomorrow.'),
        findsOneWidget,
      );
      expect(
        find.text("You've used today's applications. More tomorrow."),
        findsOneWidget,
        reason: 'the bar must still say so once the snackbar has gone',
      );
      expect(_applyButton(tester).onPressed, isNull);
      expect(
        find.text('Application submitted'),
        findsNothing,
        reason: 'nothing was submitted',
      );
      expect(server.applyCalls, 1);

      // A refused candidate taps again — everyone does. The greying has to
      // actually swallow it rather than just look disabled, or the wall is
      // re-hit once per tap for the rest of the day.
      await tester.tap(find.text('Apply now'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(server.applyCalls, 1, reason: 'the greyed button must eat the tap');
    });

    testWidgets(
      'a throttle 429 must NOT grey out Apply — the mix-up costs a whole day',
      (tester) async {
        // The half the repository group cannot show: getting the two 429s
        // backwards does its damage on the SCREEN. A candidate with ten
        // applications left, refused for one minute by the global 100/min
        // guard, must not be locked out until the UTC day rolls over.
        final server = _Server(applyStatus: 429, applyBody: _throttle429);
        await _pump(tester, server);

        await _tapApply(tester);

        // The candidate reads prose, not a class name.
        expect(
          find.text('Too many requests just now. Please try again in a minute.'),
          findsOneWidget,
        );
        expect(
          find.text('10 of 10 applications left today'),
          findsOneWidget,
          reason: 'a one-minute throttle must not spend the daily allowance',
        );
        expect(
          find.text("You've used today's applications. More tomorrow."),
          findsNothing,
        );
        expect(
          _applyButton(tester).onPressed,
          isNotNull,
          reason: 'trying again in a minute has to be possible',
        );
        expect(find.text('Apply now'), findsOneWidget);
        expect(find.text('Application submitted'), findsNothing);
      },
    );

    testWidgets(
      'the refusal greys out the bar even when the quota read failed',
      (tester) async {
        // The quota GET is best-effort and returns null on any failure, so
        // `_quota` is frequently null — and most often null exactly here,
        // since that read shares the same 100/min budget as the apply that
        // just got refused. The handler used to rebuild the quota from _quota
        // alone, giving limit 0, which both the hint and the disable condition
        // ignore. The refusal's own body carries count and limit, so it no
        // longer has to guess.
        final server = _Server(
          applyStatus: 429,
          applyBody: _quota429,
          quotaLimit: null,
        );
        await _pump(tester, server);

        await _tapApply(tester);

        expect(
          find.text('Daily application limit reached. You can apply again tomorrow.'),
          findsOneWidget,
        );
        // The bar now reflects the refusal instead of inviting another tap
        // into the same wall.
        expect(
          find.text("You've used today's applications. More tomorrow."),
          findsOneWidget,
        );
        expect(_applyButton(tester).onPressed, isNull);
        expect(find.text('Application submitted'), findsNothing);
      },
    );

    testWidgets('an already-applied refusal never flips the bar to success',
        (tester) async {
      final server = _Server(
        applyStatus: 409,
        applyBody: const {'message': 'You have already applied to this job.'},
      );
      await _pump(tester, server);

      await _tapApply(tester);

      expect(find.text('You have already applied to this job.'), findsOneWidget);
      expect(find.text('Application submitted'), findsNothing);
      // The label is only rendered when the button is NOT loading, so finding
      // it proves the spinner was cleared.
      expect(find.text('Apply now'), findsOneWidget);
    });

    testWidgets('an offline apply leaves the job un-applied and says why',
        (tester) async {
      final server = _Server(applyOffline: true);
      await _pump(tester, server);

      await _tapApply(tester);

      expect(
        find.text("Can't reach the server. Check your connection and try again."),
        findsOneWidget,
      );
      expect(find.text('Application submitted'), findsNothing);
      expect(find.text('Apply now'), findsOneWidget);
      expect(_applyButton(tester).onPressed, isNotNull,
          reason: 'a dropped connection is worth retrying');
    });

    testWidgets(
      'no resume opens the upload prompt, and declining leaves Apply usable',
      (tester) async {
        final server = _Server(
          applyStatus: 403,
          applyBody: const {
            'message': 'Upload your resume before applying.',
            'code': 'RESUME_REQUIRED',
          },
        );
        await _pump(tester, server);

        await _tapApply(tester);

        expect(find.text('Add a resume to apply'), findsOneWidget);

        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle();

        expect(find.text('Add a resume to apply'), findsNothing);
        // The bug this guards: `_applying` was left true after the prompt, and
        // `_apply` returns immediately while it is set — Apply spun forever
        // and the candidate could not try again without leaving the screen.
        expect(
          find.text('Apply now'),
          findsOneWidget,
          reason: 'the spinner must clear when the prompt is declined',
        );
        expect(_applyButton(tester).onPressed, isNotNull);
        expect(find.text('Application submitted'), findsNothing);
        expect(server.applyCalls, 1, reason: 'no resume, so no retry');
      },
    );
  });
}
