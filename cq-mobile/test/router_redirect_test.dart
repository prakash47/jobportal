import 'package:cq_mobile/core/router/app_router.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// The `redirect` closure in `app_router.dart` is the only thing between a
/// signed-out visitor and the entire signed-in app, and it is the only place
/// that decides where a fresh login or a logout throws the user next. Nothing
/// else in the suite touches it, and the two moments it actually runs — cold
/// boot, and the instant a session flips — are the two hardest to reproduce by
/// hand.
///
/// The three ways it can break are all silent until a user hits them:
///   * letting a location through it should not — the whole signed-in shell
///     renders for somebody with no session and every screen fills with 401s;
///   * bouncing a location it should not — someone who just typed the right
///     password is thrown back at the sign-in screen;
///   * sending A to B while B sends back to A — the redirect re-runs on every
///     auth change, so go_router raises "redirect loop detected" and the app
///     dead-ends on the error page instead of launching.
///
/// These tests drive the REAL router: the real route table, the real parser,
/// the real redirect closure and go_router's own loop detection. Only the
/// [RouterDelegate] — the piece that builds actual screens — is swapped for a
/// recorder, the same seam-swap the repository tests make when they replace
/// Dio's `HttpClientAdapter` and keep the rest of the pipeline live.

/// Records the match list the router settles on instead of building screens.
class _CaptureDelegate extends RouterDelegate<RouteMatchList>
    with ChangeNotifier {
  RouteMatchList? seen;

  @override
  Future<bool> popRoute() async => false;

  @override
  Future<void> setNewRoutePath(RouteMatchList configuration) async {
    seen = configuration;
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// Puts the app in a given auth state with no server, no cookie jar and no
/// path_provider. Overriding [build] is what keeps the real controller's
/// `_restoreSession()` — a session probe plus a 2.9s splash hold — out of it.
class _FixedAuth extends AuthController {
  _FixedAuth(this._initial);
  final AuthState _initial;

  @override
  AuthState build() => _initial;

  void emit(AuthState next) => state = next;
}

const _user = AuthUser(
  id: 7,
  email: 'seeker@careerqueue.app',
  name: 'Seeker',
  role: 'CANDIDATE',
  emailVerified: true,
);

const _signedIn = AuthAuthenticated(_user);
const _justRegistered = AuthAuthenticated(_user, justRegistered: true);

/// Signed-in-only destinations.
const _private = [
  '/home',
  '/onboarding',
  '/settings',
  '/alerts',
  '/search?q=flutter',
];

/// The app's counterparts to the website's public, SEO-indexed pages.
const _public = [
  '/job/senior-flutter-dev-acme-4821',
  '/companies',
  '/company/acme-overview-31',
  '/career-advice',
  '/article/how-to-write-an-indian-resume',
];

/// The five screens `AppRoutes.authPaths` lets a signed-out visitor sit on.
const _authScreens = [
  '/welcome',
  '/login',
  '/register',
  '/forgot-password',
  '/continue/phone',
];

const _appScreens = [..._private, ..._public];

/// The real router, mounted, with only the screen-building delegate replaced.
class _App {
  _App(this._tester, this._router, this._delegate, this._auth);

  final WidgetTester _tester;
  final GoRouter _router;
  final _CaptureDelegate _delegate;
  final _FixedAuth _auth;

  /// Where the router settled, query string included.
  String get at => _delegate.seen!.uri.toString();

  /// Every entry the Navigator would build, oldest first.
  List<String> get stack =>
      _delegate.seen!.matches.map((m) => m.matchedLocation).toList();

  /// The page actually on top — the one the user is looking at.
  String get shown => stack.last;

  /// True once go_router gives up, which is how a redirect loop surfaces.
  bool get failed => _delegate.seen!.isError;

  Future<String> go(String location) async {
    _router.go(location);
    await _tester.pumpAndSettle();
    return at;
  }

  /// `context.push`, which is how every auth screen and the drawer open.
  /// [GoRouter.push] reads the stack to push onto off its own delegate; ours
  /// is the recorder, so hand it the match list the recorder last saw — which
  /// is exactly what the real delegate would have supplied.
  Future<void> push(String location) async {
    _router.routeInformationProvider.push<void>(location, base: _delegate.seen!);
    await _tester.pumpAndSettle();
  }

  /// A login, a logout, or a session restored at boot — the moments the
  /// redirect exists for. The `ValueNotifier` bridge in `routerProvider` turns
  /// this into a re-parse of wherever the user currently is.
  Future<String> becomes(AuthState next) async {
    _auth.emit(next);
    await _tester.pumpAndSettle();
    return at;
  }
}

Future<_App> _mount(WidgetTester tester, AuthState state) async {
  final auth = _FixedAuth(state);
  final container = ProviderContainer(
    overrides: [authControllerProvider.overrideWith(() => auth)],
  );
  addTearDown(container.dispose);

  final router = container.read(routerProvider);
  final delegate = _CaptureDelegate();

  await tester.pumpWidget(
    MaterialApp(
      home: Router<RouteMatchList>(
        routeInformationProvider: router.routeInformationProvider,
        routeInformationParser: router.routeInformationParser,
        routerDelegate: delegate,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return _App(tester, router, delegate, auth);
}

void main() {
  group('signed out', () {
    for (final location in [..._private, '/']) {
      testWidgets('$location sends a signed-out visitor to welcome',
          (tester) async {
        final app = await _mount(tester, const AuthUnauthenticated());

        expect(await app.go(location), '/welcome');
      });
    }

    for (final location in _authScreens) {
      testWidgets('$location is a screen a signed-out visitor may sit on',
          (tester) async {
        final app = await _mount(tester, const AuthUnauthenticated());

        // Bouncing any of these would strand somebody mid-signup: the redirect
        // re-runs on every rebuild, so "back to welcome" would be permanent.
        expect(await app.go(location), location);
      });
    }

    testWidgets(
      'the public pages are not public in the app — job detail, companies and '
      'career advice all bounce to welcome',
      (tester) async {
        final app = await _mount(tester, const AuthUnauthenticated());

        for (final location in _public) {
          // Asserting the deviation deliberately. These five have website
          // counterparts that Google indexes and that the share sheet hands
          // out, but `AppRoutes.authPaths` holds only the five auth screens,
          // so inside the app they sit behind the sign-in wall. Nothing can
          // reach them signed-out today — there is no app-link intent-filter
          // in AndroidManifest.xml — which is why this reads as a choice
          // rather than a break. It is the line to change when deep links land.
          expect(await app.go(location), '/welcome',
              reason: '$location stopped bouncing. If the public pages were '
                  'opened up on purpose, move this one out of _public and '
                  'assert where it now lands instead');
        }
      },
    );
  });

  group('signed in', () {
    for (final location in _appScreens) {
      testWidgets('$location is not taken away from a signed-in user',
          (tester) async {
        final app = await _mount(tester, _signedIn);

        // Query included: dropping it would silently reset a search the user
        // had already filtered.
        expect(await app.go(location), location);
      });
    }

    for (final location in [..._authScreens, '/']) {
      testWidgets(
          '$location puts a signed-in user into the app, not a second sign-in',
          (tester) async {
        final app = await _mount(tester, _signedIn);

        expect(await app.go(location), '/home');
      });
    }

    for (final location in [..._authScreens, '/']) {
      testWidgets('$location sends a brand-new account to onboarding',
          (tester) async {
        final app = await _mount(tester, _justRegistered);

        expect(await app.go(location), '/onboarding');
      });
    }

    testWidgets('a facet search keeps every parameter the Home chip put in it',
        (tester) async {
      final app = await _mount(tester, _signedIn);

      // The literal string HomeScreen._openTaxo pushes for a city chip. Losing
      // these three does not surface as an error — /search still builds, just
      // with an unfiltered list, so the chip looks like it worked and returned
      // every job in India. The `q=` case above only covers one flat param;
      // this one carries an encoded label with a space and brackets in it.
      final chip = AppRoutes.searchFacetPath(
        kind: 'city',
        slug: 'bengaluru',
        label: 'Bengaluru (Bangalore)',
      );

      expect(Uri.parse(await app.go(chip)).queryParameters, {
        'facet': 'city',
        'slug': 'bengaluru',
        'label': 'Bengaluru (Bangalore)',
      });
    });

    testWidgets('onboarding is not a trap — finishing it is allowed to leave',
        (tester) async {
      final app = await _mount(tester, _justRegistered);
      expect(await app.go('/onboarding'), '/onboarding');

      // OnboardingScreen._finish() does exactly this go(). `justRegistered` is
      // still true at that point, so a redirect keyed on the flag alone rather
      // than on "is this an auth screen" would drag the user straight back and
      // make Continue a no-op.
      expect(await app.go('/home'), '/home');
    });
  });

  group('boot', () {
    for (final location in [..._appScreens, ..._authScreens]) {
      testWidgets('$location waits on the splash while the session is checked',
          (tester) async {
        final app = await _mount(tester, const AuthUnknown());

        // "Unknown" is not "signed out": showing welcome here would flash the
        // sign-in screen at a user who has a perfectly good saved session.
        expect(await app.go(location), '/');
      });
    }

    testWidgets('splash to welcome to home, one screen deep at every step',
        (tester) async {
      final app = await _mount(tester, const AuthUnknown());
      expect(app.at, '/', reason: 'the app opens on the splash');

      expect(await app.becomes(const AuthUnauthenticated()), '/welcome');
      expect(app.stack, ['/welcome']);

      expect(await app.becomes(_signedIn), '/home');
      expect(app.stack, ['/home'],
          reason: 'a boot must not leave the welcome screen under home');
    });

    testWidgets('a saved session goes splash straight to home, nothing beneath',
        (tester) async {
      // The ordinary launch for anyone already signed in: _restoreSession()
      // resolves and AuthUnknown becomes AuthAuthenticated with no welcome
      // screen in between. The two-step test above never exercises this edge,
      // and it is the one every returning user takes every single time.
      final app = await _mount(tester, const AuthUnknown());
      expect(app.at, '/');

      expect(await app.becomes(_signedIn), '/home');
      expect(app.stack, ['/home'],
          reason: 'the splash must not survive under home — back from home '
              'would land on a splash that immediately redirects forward');
    });

    testWidgets('a saved session for a brand-new account resumes onboarding',
        (tester) async {
      // Registration sets justRegistered, so a relaunch mid-wizard must not
      // drop the seeker at home with a half-filled profile.
      final app = await _mount(tester, const AuthUnknown());

      expect(await app.becomes(_justRegistered), '/onboarding');
      expect(app.stack, ['/onboarding']);
    });

    testWidgets('a session that dies under the user drops them at welcome',
        (tester) async {
      final app = await _mount(tester, _signedIn);
      expect(await app.go('/alerts'), '/alerts');

      // What the 401 interceptor triggers through sessionExpiredProvider.
      // Before there was a redirect for it, an expired session just left the
      // signed-in shell up with every section showing a generic error and no
      // screen offering a way back to login.
      expect(await app.becomes(const AuthUnauthenticated()), '/welcome');
    });
  });

  group('no redirect loops', () {
    for (final (label, state) in const <(String, AuthState)>[
      ('a signed-out visitor', AuthUnauthenticated()),
      ('a signed-in user', _signedIn),
      ('a brand-new account', _justRegistered),
      ('an app still checking its session', AuthUnknown()),
    ]) {
      testWidgets('nothing $label is redirected to redirects again',
          (tester) async {
        final app = await _mount(tester, state);

        for (final location in [..._appScreens, ..._authScreens, '/']) {
          final landed = await app.go(location);
          // This is the whole assertion. go_router applies `redirect` to its
          // own output until it returns null, so A to B to A never comes back
          // as a location — it comes back as a GoException ("redirect loop
          // detected" / "too many redirects") turned into an error match list,
          // and the app dead-ends on the error page at launch. An error match
          // list carries no matches, so report the settled uri, not `stack`.
          expect(app.failed, isFalse,
              reason: '$location gave up; go_router settled on ${app.at}');

          // Deliberately NOT asserting `go(landed) == landed`: go_router
          // resolves the chain internally, so the landing location is a fixed
          // point by construction and that comparison can never fail. What
          // re-navigating does still prove is that the location the redirect
          // chose is one the route table can match on a cold entry.
          await app.go(landed);
          expect(app.failed, isFalse,
              reason: '$location landed on $landed, which is not routable');
        }
      });
    }
  });

  group('the stack the redirect leaves behind', () {
    testWidgets(
      'signing in from the pushed login screen leaves welcome underneath home',
      (tester) async {
        final app = await _mount(tester, const AuthUnauthenticated());
        expect(app.stack, ['/welcome']);

        // AuthLandingScreen: `onPressed: () => context.push(AppRoutes.login)`.
        await app.push('/login');
        expect(app.stack, ['/welcome', '/login']);

        await app.becomes(_signedIn);

        // The redirect answers with a location, not with a navigation type, so
        // go_router replays the pending PUSH and stacks home on top of the
        // sign-in landing screen instead of replacing it. Home is therefore
        // not the root of the stack, and system-back from it targets /welcome.
        expect(app.shown, '/home');
        expect(app.stack, ['/welcome', '/home'],
            reason: 'the stack changed. ["/home"] is the CORRECT shape — if '
                'the redirect now replaces instead of replaying the push, '
                'this pin has done its job: flip it to ["/home"]');
      },
    );

    testWidgets(
      'logging out leaves the signed-in home underneath the welcome screen',
      (tester) async {
        final app = await _mount(tester, _signedIn);

        // AppDrawer opens Settings with router.push, and both its "Log out"
        // row and SettingsScreen call authController.logout() from there.
        await app.push('/settings');
        expect(app.stack, ['/home', '/settings']);

        await app.becomes(const AuthUnauthenticated());

        expect(app.shown, '/welcome');
        expect(app.stack, ['/home', '/welcome'],
            reason: 'the stack changed. ["/welcome"] is the CORRECT shape — if '
                'logout now clears the stack, this pin has done its job: flip '
                'it to ["/welcome"] and drop the app.at expectation below');
        // And the location go_router hands back for state restoration is the
        // base of that stack, not the page actually on screen.
        expect(app.at, '/home',
            reason: 'the restoration URI stopped disagreeing with the visible '
                'page, which is the fix, not a regression');
      },
    );
  });
}
