import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../data/auth_repository.dart';
import '../data/auth_user.dart';

/// The app's auth status as a sealed set of exactly three cases. The router
/// switches on these to decide which screen to show.
sealed class AuthState {
  const AuthState();
}

/// App just launched; we're checking the saved session. → shows the splash.
final class AuthUnknown extends AuthState {
  const AuthUnknown();
}

/// No valid session. → shows login / register.
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Signed in. → shows the app (home), or onboarding for a brand-new account.
final class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user, {this.justRegistered = false});
  final AuthUser user;

  /// True only immediately after registration, so the router sends the new
  /// seeker into the onboarding wizard (login/session-restore go straight home).
  final bool justRegistered;
}

final authRepositoryProvider = FutureProvider<AuthRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return AuthRepository(dio);
});

/// Owns the auth state and the actions that change it (login / register /
/// logout). Screens read the state and call these methods.
final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthController extends Notifier<AuthState> {
  /// The repo is built once the (async) Dio client is ready.
  Future<AuthRepository> get _repo => ref.read(authRepositoryProvider.future);

  @override
  AuthState build() {
    // Restore any saved session in the background; stay "unknown" (splash)
    // until it resolves.
    _restoreSession();
    return const AuthUnknown();
  }

  Future<void> _restoreSession() async {
    // Keep the splash on-screen long enough for its animation to play, even if
    // the session check returns instantly.
    final minSplash = Future<void>.delayed(const Duration(milliseconds: 2900));
    AuthUser? user;
    // Demo mode never touches the server — land on the welcome screen, where an
    // "Enter demo mode" button signs in with sample data.
    if (!AppConfig.demoMode) {
      try {
        final repo = await _repo;
        user = await repo.currentUser().timeout(const Duration(seconds: 6));
      } catch (_) {
        user = null; // backend unreachable / slow → treat as logged out
      }
    }
    await minSplash;
    state = user != null
        ? AuthAuthenticated(user)
        : const AuthUnauthenticated();
  }

  /// Throws [AuthException] on failure — the screen catches it and shows the
  /// message. On success the state flips to authenticated and the router moves
  /// the user to home automatically.
  Future<void> login({
    required String email,
    required String password,
  }) async {
    final repo = await _repo;
    final user = await repo.login(email: email, password: password);
    state = AuthAuthenticated(user);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    final repo = await _repo;
    final user = await repo.register(
      name: name,
      email: email,
      password: password,
      phone: phone,
    );
    state = AuthAuthenticated(user, justRegistered: true);
  }

  Future<void> logout() async {
    // In demo mode there's no server session to revoke.
    if (!AppConfig.demoMode) {
      final repo = await _repo;
      await repo.logout();
    }
    state = const AuthUnauthenticated();
  }

  /// Offline demo sign-in — no server call. Only reachable in
  /// [AppConfig.demoMode], via the welcome screen's demo button.
  void demoLogin() {
    state = const AuthAuthenticated(
      AuthUser(
        id: 0,
        email: 'demo@careerqueue.app',
        name: 'Demo User',
        role: 'CANDIDATE',
        emailVerified: true,
      ),
    );
  }
}
