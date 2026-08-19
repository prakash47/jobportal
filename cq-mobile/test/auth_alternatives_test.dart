import 'package:cq_mobile/core/config/app_config.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/auth/presentation/auth_landing_screen.dart';
import 'package:cq_mobile/features/auth/presentation/login_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// App Store guideline 2.1 rejects a build whose visible features do nothing,
/// and this app shipped five such entry points: "Continue with Google" twice,
/// "Continue with Phone" twice, and "Log in with OTP". The phone one was the
/// worst — it pushed a real screen that collected and validated a number before
/// dead-ending.
///
/// None of them can sign anyone in yet: Google needs an OAuth client id (which
/// needs the release keystore's SHA-1 first) and phone/OTP needs backend
/// endpoints that do not exist. They are gated on AppConfig.showAuthAlternatives
/// instead of deleted, so the finished screens survive for the day the backing
/// services arrive.
///
/// These tests mount the real screens and assert nothing dead is on them. They
/// exist so that re-adding a "coming soon" button is a red build rather than a
/// rejection email weeks later.
Future<void> _pump(WidgetTester tester, Widget screen) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(theme: CqTheme.light, home: screen),
    ),
  );
  await tester.pump();
}

void main() {
  test('the alternatives are off unless a build explicitly asks for them', () {
    // A release built with no --dart-define must not show them.
    expect(AppConfig.showAuthAlternatives, isFalse);
  });

  testWidgets('the landing screen offers no dead sign-in route', (tester) async {
    await _pump(tester, const AuthLandingScreen());

    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Continue with Phone'), findsNothing);
    // The email path is the whole point of the screen and must survive.
    expect(find.text('Continue with Email'), findsOneWidget);
  });

  testWidgets('the login screen offers no dead sign-in route', (tester) async {
    await _pump(tester, const LoginScreen());

    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Continue with Phone'), findsNothing);
    expect(find.text('Log in with OTP'), findsNothing);
    expect(find.text('Log in'), findsWidgets);
  });

  testWidgets('no screen still advertises something as coming soon',
      (tester) async {
    for (final screen in const <Widget>[AuthLandingScreen(), LoginScreen()]) {
      await _pump(tester, screen);
      expect(
        find.textContaining('coming soon', findRichText: true),
        findsNothing,
        reason: '${screen.runtimeType} still promises an unbuilt feature',
      );
    }
  });
}
