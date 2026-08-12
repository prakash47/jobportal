import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/alerts/presentation/alerts_screen.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/auth_landing_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/phone_continue_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/career_advice/presentation/article_detail_screen.dart';
import '../../features/career_advice/presentation/career_advice_screen.dart';
import '../../features/companies/presentation/companies_screen.dart';
import '../../features/companies/presentation/company_detail_screen.dart';
import '../../features/jobs/presentation/job_detail_screen.dart';
import '../../features/jobs/presentation/job_search_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/shell/presentation/main_shell.dart';

/// All route paths in one place — no stringly-typed typos scattered around.
abstract final class AppRoutes {
  static const splash = '/';
  static const welcome = '/welcome';
  static const phoneContinue = '/continue/phone';
  static const login = '/login';
  static const register = '/register';
  static const onboarding = '/onboarding';
  static const home = '/home';
  static const settings = '/settings';
  static const companies = '/companies';
  static const careerAdvice = '/career-advice';
  static const alerts = '/alerts';

  /// Job detail is a pushed screen keyed by the job's canonical slug.
  static String jobDetailPath(String slug) => '/job/$slug';

  /// Company profile, keyed by the `slug-overview-id` handle.
  static String companyPath(String handle) => '/company/$handle';

  /// Career-advice article, keyed by its slug.
  static String articlePath(String slug) => '/article/$slug';

  /// Job search, optionally pre-filtered by `q`.
  static String searchPath(String query) =>
      query.isEmpty ? '/search' : '/search?q=${Uri.encodeQueryComponent(query)}';

  /// Screens an unauthenticated user is allowed to sit on.
  static const authPaths = {
    welcome,
    phoneContinue,
    login,
    register,
  };
}

/// The app's router. Its [GoRouter.redirect] is the single gate that decides —
/// from the live [authControllerProvider] — whether the user sees the splash,
/// the welcome/auth screens, or the home area.
final routerProvider = Provider<GoRouter>((ref) {
  // Bridge Riverpod → go_router: re-run redirect whenever auth state changes.
  final refresh = ValueNotifier<AuthState>(ref.read(authControllerProvider));
  ref.onDispose(refresh.dispose);
  ref.listen(authControllerProvider, (_, next) => refresh.value = next);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      final onSplash = loc == AppRoutes.splash;
      final onAuth = AppRoutes.authPaths.contains(loc);

      return switch (auth) {
        // Still checking the saved session → hold on the splash.
        AuthUnknown() => onSplash ? null : AppRoutes.splash,
        // Not logged in → allow the welcome + auth screens only.
        AuthUnauthenticated() => onAuth ? null : AppRoutes.welcome,
        // Logged in → keep them out of splash/auth. A brand-new account lands
        // on onboarding; everyone else goes home. Already on a real app route
        // (home, onboarding, …) → stay put.
        AuthAuthenticated(justRegistered: final jr) => (onSplash || onAuth)
            ? (jr ? AppRoutes.onboarding : AppRoutes.home)
            : null,
      };
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (_, _) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.welcome,
        builder: (_, _) => const AuthLandingScreen(),
      ),
      GoRoute(
        path: AppRoutes.phoneContinue,
        builder: (_, _) => const PhoneContinueScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        // The email-first step passes the address via `extra` to prefill it.
        builder: (_, state) =>
            LoginScreen(initialEmail: state.extra is String ? state.extra as String : null),
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (_, state) => RegisterScreen(
          initialEmail: state.extra is String ? state.extra as String : null,
        ),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        builder: (_, _) => const OnboardingScreen(),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (_, _) => const MainShell(),
      ),
      GoRoute(
        path: AppRoutes.settings,
        builder: (_, _) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/job/:slug',
        builder: (_, state) =>
            JobDetailScreen(slug: state.pathParameters['slug'] ?? ''),
      ),
      GoRoute(
        path: AppRoutes.companies,
        builder: (_, _) => const CompaniesScreen(),
      ),
      GoRoute(
        path: '/company/:handle',
        builder: (_, state) =>
            CompanyDetailScreen(handle: state.pathParameters['handle'] ?? ''),
      ),
      GoRoute(
        path: AppRoutes.careerAdvice,
        builder: (_, _) => const CareerAdviceScreen(),
      ),
      GoRoute(
        path: '/article/:slug',
        builder: (_, state) =>
            ArticleDetailScreen(slug: state.pathParameters['slug'] ?? ''),
      ),
      GoRoute(
        path: AppRoutes.alerts,
        builder: (_, _) => const AlertsScreen(),
      ),
      GoRoute(
        path: '/search',
        builder: (_, state) =>
            JobSearchScreen(initialQuery: state.uri.queryParameters['q']),
      ),
    ],
  );
});
