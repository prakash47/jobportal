import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:cq_mobile/features/settings/presentation/settings_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Settings holds the two things on this phone a user cannot put back by hand:
/// the switches that decide what Career Queue is allowed to email them, and the
/// button that destroys the account.
///
/// The repository underneath is already pinned — path, verb and the
/// `{'confirm':'DELETE'}` body all live in repositories_contract_test.dart.
/// Every remaining hazard is in the wiring above it, which no test has ever
/// mounted:
///
///  * The three switches are drawn in one order and mapped to wire keys in
///    another. Swap two and nothing looks wrong and nothing 400s — the user
///    just silently turns off a different email from the one they pointed at.
///  * A save adopts the server's answer over the local draft, which is correct
///    and makes the failure path sharp: if a rejected save also threw the edit
///    away, the user's only clue would be a toast they may not read.
///  * Deletion is the one action in the app with nothing behind it. The only
///    thing between a mis-tap and a destroyed account is a confirm button that
///    stays dead until DELETE is typed, and the only thing between a *failed*
///    deletion and an unreachable user is that a failure must NOT sign them
///    out. An account that still exists plus a phone with no session is a
///    support ticket that cannot be resolved from inside the app.
///
/// docs/DATA_SAFETY.md answers a Play Console question in writing — deletion is
/// available in-app, via a typed DELETE confirmation in Settings › Danger zone.
/// Until this file that promise was backed by reading the code.

/// One canned HTTP answer. A status >= 400 makes Dio raise the same
/// `DioException`, response body attached, that the screen catches in
/// production.
class _Reply {
  const _Reply(this.json, {this.status = 200});

  final String json;
  final int status;
}

/// The API, scripted per request so one route can fail or hang while its
/// neighbours stay healthy. Returning null from the script means "never
/// answers" — a request still in flight.
///
/// [script] is mutable: the retry test needs a server that is dead for the
/// first call and alive for the second.
class _Api implements HttpClientAdapter {
  _Api(this.script);

  _Reply? Function(RequestOptions options) script;

  final List<RequestOptions> seen = [];

  /// The bytes actually handed to the socket, decoded. `RequestOptions.data`
  /// is the map the caller passed in, captured before Dio's transformer runs,
  /// so it cannot tell a body that reaches the server from one dropped on the
  /// way out — and a body on a DELETE is exactly the kind of thing a client
  /// library is entitled to drop.
  final List<String?> bodies = [];

  /// 'PATCH /me/notifications', in call order.
  List<String> get calls =>
      seen.map((o) => '${o.method} ${o.path}').toList(growable: false);

  List<String> callsTo(String method) =>
      calls.where((c) => c.startsWith('$method ')).toList(growable: false);

  String? get lastBody => bodies.last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    bodies.add(
      requestStream == null
          ? null
          : utf8.decode(await requestStream.expand((c) => c).toList()),
    );
    final reply = script(options);
    if (reply == null) return Completer<ResponseBody>().future;
    // Without the content-type Dio hands the repository a String and
    // NotificationPreferences.fromJson quietly falls back to every default.
    return ResponseBody.fromString(
      reply.json,
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// `GET /me/notifications` as the NestJS service actually shapes it — the
/// `*Enabled` wire keys, not the Dart field names.
String _wire({
  required bool jobAlerts,
  required bool applicationUpdates,
  required bool productNews,
}) =>
    '{"jobAlertsEnabled":$jobAlerts,'
    '"applicationStatusEnabled":$applicationUpdates,'
    '"productNewsEnabled":$productNews}';

/// A server that answers every route with the given preferences and succeeds
/// at everything, including the delete (which ignores the body).
_Api _healthy({
  bool jobAlerts = true,
  bool applicationUpdates = true,
  bool productNews = false,
}) =>
    _Api((_) => _Reply(_wire(
          jobAlerts: jobAlerts,
          applicationUpdates: applicationUpdates,
          productNews: productNews,
        )));

/// A phone with no signal.
_Reply? _noSignal(RequestOptions options) => throw DioException.connectionError(
      requestOptions: options,
      reason: 'no network',
    );

/// Stands in for the real auth controller, which cannot run here: its `build`
/// probes the session and then holds the splash for 2.9 seconds, and its
/// `logout` reaches for the cookie jar behind path_provider.
///
/// Counting the calls is the point. Deletion is the only place in the app where
/// signing out is conditional on a server call having succeeded.
class _FakeAuth extends AuthController {
  int logouts = 0;

  @override
  AuthState build() => const AuthAuthenticated(
        AuthUser(
          id: 7,
          email: 'seeker@careerqueue.app',
          name: 'Seeker',
          role: 'CANDIDATE',
          emailVerified: true,
        ),
      );

  @override
  Future<void> logout() async {
    logouts++;
    state = const AuthUnauthenticated();
  }
}

/// Mounts the real screen over a real Dio whose transport is faked.
///
/// Overriding `dioProvider` reaches the whole data layer — every repository is
/// a `FutureProvider` built from it — and keeps `cookieJarProvider`, and so
/// path_provider, out of the graph entirely.
Future<_FakeAuth> _open(WidgetTester tester, _Api api) async {
  // Tall enough that the danger zone is on screen without scrolling; the real
  // screen fits inside a 390x844 phone.
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final auth = _FakeAuth();
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWith((ref) async => dio),
        authControllerProvider.overrideWith(() => auth),
      ],
      child: MaterialApp(
        theme: CqTheme.light,
        home: const SettingsScreen(),
      ),
    ),
  );
  await _pumpFrames(tester);
  return auth;
}

/// Advances a handful of frames so the load chain (provider → repository →
/// request → setState) lands.
///
/// `pumpAndSettle` is not available on this screen: while it is loading,
/// CqLoader's brand animation repeats forever, so settling never returns.
Future<void> _pumpFrames(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Presses the keyboard's Done key before the dialog is dismissed — something a
/// phone user does often enough, but here it is a workaround, and the reader
/// deserves to know for what.
///
/// **`_confirmDelete` disposes the dialog's `TextEditingController` one line
/// after `showDialog` returns**, on the reasoning — written into a comment
/// there — that "the dialog is gone either way by this point". It is not: the
/// AlertDialog stays mounted for its exit transition, and popping it moves
/// focus off the field, which rebuilds the TextField and re-subscribes it to
/// the controller that was just thrown away. Debug and profile builds trip
/// `A TextEditingController was used after being disposed` and blank the
/// closing dialog; a release build survives only because the assert is compiled
/// out. Reported, not fixed — the fix belongs in lib/.
///
/// Pressing Done first unfocuses the field, so the pop no longer rebuilds it
/// and the tests below can reach the behaviour they are actually about. There
/// is no test asserting the defect itself: the exception is thrown from inside
/// a build, so the framework substitutes an error widget into the half-closed
/// dialog and the element tree stays broken past the end of the test, failing
/// whatever ran next. That defect is fixed — the controller now belongs to the
/// screen's State and is disposed with it — and the keyboard-still-up case has
/// its own test below. The helper stays because most tests here are about
/// something else and are clearer without a keyboard in the way.
Future<void> _putTheKeyboardAway(WidgetTester tester) async {
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await _pumpFrames(tester);
}

void _dismissWithKeyboardUp() {
  testWidgets('the dialog can be dismissed with the keyboard still up',
      (tester) async {
    // What a real user does: type, then hit the system back gesture or Cancel
    // without dismissing the keyboard first. The controller used to be created
    // per-call and disposed the moment showDialog returned, while the route was
    // still animating out and the TextField still attached — so this threw
    // "A TextEditingController was used after being disposed" and painted an
    // error widget over the closing dialog on every debug build.
    final api = _healthy();
    await _open(tester, api);
    await _pumpFrames(tester);

    await tester.tap(find.text('Delete account').last);
    await _pumpFrames(tester);
    await tester.enterText(find.byType(TextField), 'DELETE');
    await _pumpFrames(tester);

    // No receiveAction(done) — the keyboard stays up on purpose.
    await tester.tap(find.text('Cancel'));
    await _pumpFrames(tester);

    expect(tester.takeException(), isNull,
        reason: 'dismissing with the keyboard up must not touch a disposed '
            'controller');
    expect(find.byType(AlertDialog), findsNothing);

    // And the screen still works afterwards: reopening starts empty rather
    // than remembering the last attempt.
    await tester.tap(find.text('Delete account').last);
    await _pumpFrames(tester);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, '');
    await tester.tap(find.text('Cancel'));
    await _pumpFrames(tester);
  });
}

/// Runs a toast out to the end of its four seconds, so what is asserted next is
/// the screen rather than the message sitting on top of it.
///
/// The clock is jumped twice deliberately: a snackbar only creates its display
/// timer once the entrance animation reports complete, so the first jump starts
/// the timer and the second runs it out.
Future<void> _letTheToastFade(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 5));
  await tester.pump(const Duration(seconds: 5));
  await _pumpFrames(tester);
}

/// The switch belonging to the row headed [label] — the control the user is
/// actually pointing at. Scoping to the row is the whole point: a bare
/// `find.byType(Switch)` cannot tell the three apart, which is precisely the
/// mix-up worth testing for.
Finder _switchIn(String label) => find.descendant(
      of: find.ancestor(of: find.text(label), matching: find.byType(Row)).first,
      matching: find.byType(Switch),
    );

bool _isOn(WidgetTester tester, String label) =>
    tester.widget<Switch>(_switchIn(label)).value;

/// The row label each wire key is supposed to drive.
const _rowFor = {
  'jobAlertsEnabled': 'Job alerts',
  'applicationStatusEnabled': 'Application updates',
  'productNewsEnabled': 'Product news',
};

/// The screen's own delete entry, in the danger zone.
final _deleteEntry = find.widgetWithText(OutlinedButton, 'Delete account');

/// The confirm action inside the dialog. It carries the same words as the
/// entry button, so both finders have to be typed to stay apart.
final _confirmDelete = find.widgetWithText(TextButton, 'Delete account');

final _cancelDelete = find.widgetWithText(TextButton, 'Cancel');

bool _confirmIsArmed(WidgetTester tester) =>
    tester.widget<TextButton>(_confirmDelete).onPressed != null;

/// Opens the danger-zone dialog and types [phrase] into its confirmation field.
Future<void> _openDeleteDialog(WidgetTester tester, {String? phrase}) async {
  await tester.tap(_deleteEntry);
  await _pumpFrames(tester);
  if (phrase != null) {
    await tester.enterText(find.byType(TextField), phrase);
    await _pumpFrames(tester);
  }
}

/// Presses the dialog's confirm action, keyboard down first.
Future<void> _confirmTheDeletion(WidgetTester tester) async {
  await _putTheKeyboardAway(tester);
  await tester.tap(_confirmDelete);
  await _pumpFrames(tester);
}

/// The Save button's target opacity — what tells the user at a glance whether
/// there is anything to save. 1.0 is armed, 0.45 is greyed.
double _saveOpacity(WidgetTester tester) => tester
    .widget<AnimatedOpacity>(
      find.ancestor(
        of: find.text('Save changes'),
        matching: find.byType(AnimatedOpacity),
      ).first,
    )
    .opacity;

Future<void> _tapSave(WidgetTester tester) async {
  // The button is deliberately still hit-testable when it is greyed — one of
  // the cases below is "the user taps it anyway" — so a missed hit is not a
  // warning worth printing.
  await tester.tap(find.text('Save changes'), warnIfMissed: false);
  await _pumpFrames(tester);
}

void main() {
  _dismissWithKeyboardUp();

  group('the toggles the server sent', () {
    testWidgets('the screen asks for the preferences before it shows any',
        (tester) async {
      final api = _Api((_) => null);
      await _open(tester, api);

      // Ordered first on purpose. `_loading` is a field initialiser, so the
      // loading line is already on screen one frame after mount even for a
      // screen that never issued a request — a spinner over a request that was
      // never sent is the forever-spinner, and it reads as fine.
      expect(api.calls, ['GET /me/notifications']);
      expect(find.text('Loading your settings…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    for (final entry in _rowFor.entries) {
      testWidgets('${entry.key} is the switch labelled "${entry.value}"',
          (tester) async {
        // Exactly one key on, so a swapped pair fails here and cannot hide
        // behind two rows that happen to agree. And the two rows expected off
        // are ones whose parse fallback is ON, so a key this screen no longer
        // reads correctly shows up as an email the user never asked for rather
        // than as a quiet nothing.
        await _open(
          tester,
          _Api((_) => _Reply(
                '{"jobAlertsEnabled":${entry.key == 'jobAlertsEnabled'},'
                '"applicationStatusEnabled":'
                '${entry.key == 'applicationStatusEnabled'},'
                '"productNewsEnabled":${entry.key == 'productNewsEnabled'}}',
              )),
        );

        for (final row in _rowFor.values) {
          expect(_isOn(tester, row), row == entry.value,
              reason: '"$row" does not reflect what the server sent for '
                  '${entry.key}');
        }
      });
    }

    testWidgets('a failure offers a retry, and the retry really re-asks',
        (tester) async {
      final api = _Api(_noSignal);
      await _open(tester, api);

      expect(find.text('Loading your settings…'), findsNothing,
          reason: 'the screen span forever instead of reporting the failure');
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      // The icon alone is not the failure state — an icon over an empty line is
      // still a dead end. This is the network's own diagnosis reaching the user
      // (`friendlyDioMessage`, response == null), not the screen's generic
      // 'Could not load your settings.' fallback: the difference tells them to
      // check the wifi rather than to file a bug.
      expect(
        find.text("Can't reach the server. Check your connection and try again."),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget,
          reason: 'a settings screen with no way out is a dead end — the user '
              'cannot reach their own preferences again without restarting');

      api.script = (_) => _Reply(_wire(
            jobAlerts: false,
            applicationUpdates: true,
            productNews: true,
          ));
      await tester.tap(find.text('Try again'));
      await _pumpFrames(tester);

      expect(api.calls, ['GET /me/notifications', 'GET /me/notifications']);
      expect(find.byIcon(Icons.cloud_off_rounded), findsNothing);
      expect(_isOn(tester, 'Job alerts'), isFalse);
      expect(_isOn(tester, 'Product news'), isTrue);
    });
  });

  group('saving', () {
    testWidgets('with nothing changed, Save is greyed and sends nothing',
        (tester) async {
      final api = _healthy();
      await _open(tester, api);

      expect(_saveOpacity(tester), lessThan(1.0));
      await _tapSave(tester);

      // A PATCH here is not harmless: `.strict()` aside, it upserts a
      // preferences row for a user whose settings the server was deliberately
      // still keeping as defaults.
      expect(api.callsTo('PATCH'), isEmpty);
    });

    testWidgets("flipping a switch arms Save and writes the API's own keys",
        (tester) async {
      final api = _healthy(
        jobAlerts: true,
        applicationUpdates: true,
        productNews: false,
      );
      await _open(tester, api);

      await tester.tap(_switchIn('Product news'));
      await _pumpFrames(tester);
      expect(_saveOpacity(tester), 1.0);

      await _tapSave(tester);

      expect(api.callsTo('PATCH'), ['PATCH /me/notifications']);
      // The endpoint is `.strict()` and every key is optional, so a Dart-named
      // key is not a compile error, not a runtime error, and not a 400 — it is
      // a 200 that changed nothing. Decoded rather than string-compared so the
      // assertion is about the keys, not about map ordering.
      expect(jsonDecode(api.lastBody!), {
        'jobAlertsEnabled': true,
        'applicationStatusEnabled': true,
        'productNewsEnabled': true,
      });
    });

    testWidgets("the screen redraws from the server's answer, not its draft",
        (tester) async {
      // The server disagrees with the edit: the user turned product news on,
      // the server says it is still off. Whatever the reason, the row the user
      // is left looking at has to be the row the server will actually honour —
      // otherwise Settings shows one thing and the mail queue does another.
      final api = _Api((_) => _Reply(_wire(
            jobAlerts: true,
            applicationUpdates: true,
            productNews: false,
          )));
      await _open(tester, api);

      await tester.tap(_switchIn('Product news'));
      await _pumpFrames(tester);
      expect(_isOn(tester, 'Product news'), isTrue);

      await _tapSave(tester);

      expect(find.text('Preferences saved'), findsOneWidget);
      expect(_isOn(tester, 'Product news'), isFalse);
      // And the screen now believes the server, so there is nothing left to
      // save — a Save that stayed armed would re-send the rejected value.
      expect(_saveOpacity(tester), lessThan(1.0));

      await _letTheToastFade(tester);
      await _tapSave(tester);
      expect(api.callsTo('PATCH').length, 1);
    });

    testWidgets('a refused save keeps the edit on screen and says why',
        (tester) async {
      final api = _Api((o) => o.method == 'PATCH'
          ? const _Reply(
              '{"message":"Preferences are read-only right now."}',
              status: 503,
            )
          : _Reply(_wire(
              jobAlerts: true,
              applicationUpdates: true,
              productNews: false,
            )));
      await _open(tester, api);

      await tester.tap(_switchIn('Job alerts'));
      await _pumpFrames(tester);
      await _tapSave(tester);

      // The server's own words, not a generic line: "something went wrong" on
      // a screen with three switches tells the user nothing about whether to
      // wait or to change something.
      expect(find.text('Preferences are read-only right now.'), findsOneWidget);
      // The edit survives, and Save stays armed, so retrying is one tap rather
      // than re-deriving which switch they had moved.
      expect(_isOn(tester, 'Job alerts'), isFalse);
      expect(_saveOpacity(tester), 1.0);

      await _letTheToastFade(tester);
      await _tapSave(tester);
      expect(api.callsTo('PATCH').length, 2,
          reason: 'a failed save left Save inert, so the user could not retry');
    });
  });

  group('deleting the account', () {
    testWidgets('the danger zone opens a dialog that spells out the damage',
        (tester) async {
      final api = _healthy();
      await _open(tester, api);

      // Nothing has been asked of the server yet beyond the initial read: the
      // entry button itself must not be the point of no return.
      await _openDeleteDialog(tester);

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Delete your account?'), findsOneWidget);
      // Scoped to the dialog on purpose. The danger zone standing behind it
      // carries the same sentence, so an unscoped `textContaining` is answered
      // by the screen underneath and the dialog can lose its warning entirely
      // without this test noticing (verified: it does).
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('cannot be undone'),
        ),
        findsOneWidget,
        reason: 'the confirmation step no longer says the deletion is '
            'permanent — the only place the user is told before they act',
      );
      // And it names what goes with the account, rather than leaving the user
      // to guess whether "account" includes the applications they have out.
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('saved jobs, applications'),
        ),
        findsOneWidget,
      );
      expect(find.text('Type DELETE to confirm'), findsOneWidget);
      expect(api.callsTo('DELETE'), isEmpty);
    });

    testWidgets('the confirm button is dead until the phrase is right',
        (tester) async {
      final api = _healthy();
      final auth = await _open(tester, api);
      await _openDeleteDialog(tester);

      // '' is the state the dialog opens in — an autofocused field one stray
      // tap away from the confirm button.
      for (final nearMiss in ['', 'DELET', 'DELETE MY ACCOUNT', 'remove me']) {
        await tester.enterText(find.byType(TextField), nearMiss);
        await _pumpFrames(tester);

        expect(_confirmIsArmed(tester), isFalse,
            reason: '"$nearMiss" armed an irreversible action');
      }

      // Pressing it anyway is the mis-tap this guard exists for: the dialog
      // has to still be standing and the account still alive.
      await tester.tap(_confirmDelete, warnIfMissed: false);
      await _pumpFrames(tester);

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(api.callsTo('DELETE'), isEmpty);
      expect(auth.logouts, 0);
    });

    testWidgets("typing DELETE arms it — and so, today, does 'delete'",
        (tester) async {
      await _open(tester, _healthy());
      await _openDeleteDialog(tester, phrase: 'DELETE');

      expect(_confirmIsArmed(tester), isTrue);

      // Current behaviour, asserted rather than assumed: the check is
      // `trim().toUpperCase()`, so a phone that autocorrected the caps, or a
      // keyboard that appended a space, still lets the user through. The
      // request body is the literal 'DELETE' either way, so the server contract
      // is unaffected — but docs/DATA_SAFETY.md describes this to the stores as
      // a typed "DELETE" confirmation, and this is the line that defines how
      // literally that is meant.
      await tester.enterText(find.byType(TextField), '  delete  ');
      await _pumpFrames(tester);
      expect(_confirmIsArmed(tester), isTrue);
    });

    testWidgets('cancelling sends nothing, even with DELETE already typed',
        (tester) async {
      final api = _healthy();
      final auth = await _open(tester, api);
      await _openDeleteDialog(tester, phrase: 'DELETE');

      await _putTheKeyboardAway(tester);
      await tester.tap(_cancelDelete);
      await _pumpFrames(tester);

      expect(find.byType(AlertDialog), findsNothing);
      expect(api.callsTo('DELETE'), isEmpty,
          reason: 'backing out of the dialog still destroyed the account');
      expect(auth.logouts, 0);
      // And the user is returned to a working screen, not a spinner stuck on
      // a deletion that never started.
      expect(tester.widget<OutlinedButton>(_deleteEntry).onPressed, isNotNull);
    });

    testWidgets('confirming sends exactly one DELETE, phrase on the wire',
        (tester) async {
      final api = _healthy();
      await _open(tester, api);
      await _openDeleteDialog(tester, phrase: 'DELETE');

      await _confirmTheDeletion(tester);

      expect(api.callsTo('DELETE'), ['DELETE /v1/me/account']);
      // A DELETE carrying a body is unusual enough that a client library
      // dropping it is a live possibility, and the server's DTO is
      // `z.object({confirm: z.literal('DELETE')}).strict()` — an empty body is
      // a 400 the user reads as "could not delete your account".
      expect(jsonDecode(api.lastBody!), {'confirm': 'DELETE'});
    });

    testWidgets('a completed deletion signs the user out', (tester) async {
      final auth = await _open(tester, _healthy());
      await _openDeleteDialog(tester, phrase: 'DELETE');

      await _confirmTheDeletion(tester);

      // The account is gone server-side; leaving the session up would leave the
      // app making authenticated calls on behalf of a user that no longer
      // exists, and the phone holding a live 30-day refresh cookie.
      expect(auth.logouts, 1);
    });

    testWidgets('a refused deletion explains itself and keeps the session',
        (tester) async {
      final api = _Api((o) => o.method == 'DELETE'
          ? const _Reply(
              '{"message":"Cancel your subscription before deleting."}',
              status: 409,
            )
          : _Reply(_wire(
              jobAlerts: true,
              applicationUpdates: true,
              productNews: false,
            )));
      final auth = await _open(tester, api);
      await _openDeleteDialog(tester, phrase: 'DELETE');

      await _confirmTheDeletion(tester);

      expect(find.text('Cancel your subscription before deleting.'),
          findsOneWidget);
      // The one that matters. Signing out here would strand the user outside an
      // account that still exists, holding an app that can no longer show them
      // the reason it gave.
      expect(auth.logouts, 0,
          reason: 'a failed deletion signed the user out of a live account');

      await _letTheToastFade(tester);
      // And the danger zone is usable again, so they can act on what they were
      // just told rather than restarting the app.
      expect(tester.widget<OutlinedButton>(_deleteEntry).onPressed, isNotNull);
    });

    testWidgets('a second tap during the deletion cannot fire a second DELETE',
        (tester) async {
      // The DELETE never answers — a slow network, which is exactly when a user
      // taps again.
      final api = _Api((o) => o.method == 'DELETE'
          ? null
          : _Reply(_wire(
              jobAlerts: true,
              applicationUpdates: true,
              productNews: false,
            )));
      await _open(tester, api);
      await _openDeleteDialog(tester, phrase: 'DELETE');

      await _confirmTheDeletion(tester);

      // The in-flight state is visible and the entry is inert, so the dialog
      // cannot be reopened underneath a deletion already on its way.
      expect(
        find.descendant(
          of: _deleteEntry,
          matching: find.byType(CircularProgressIndicator),
        ),
        findsOneWidget,
      );
      expect(tester.widget<OutlinedButton>(_deleteEntry).onPressed, isNull);

      await tester.tap(_deleteEntry, warnIfMissed: false);
      await _pumpFrames(tester);

      expect(find.byType(AlertDialog), findsNothing);
      expect(api.callsTo('DELETE').length, 1);
    });
  });
}
