import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_boot.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/network_providers.dart';
import '../data/auth_repository.dart';
import '../data/auth_user.dart';
import '../../../core/state/session_events.dart';
import '../data/session_cache.dart';

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
    // The network layer raises this when the server refuses our refresh token.
    // Until this existed, an expired session just produced failing requests
    // inside a signed-in shell: every screen showed a generic error and no
    // screen offered a way back to login.
    ref.listen(sessionExpiredProvider, (previous, next) {
      if (previous == next) return;
      if (state is AuthAuthenticated) {
        // Confirmed dead by the server, so the cached identity AND the cookies
        // must go — otherwise the next launch retries a credential we already
        // know the server rejects.
        _cache.clear();
        _clearSessionCookies();
        state = const AuthUnauthenticated();
      }
    });
    // Restore any saved session in the background; stay "unknown" (splash)
    // until it resolves.
    _restoreSession();
    return const AuthUnknown();
  }

  static const _cache = SessionCache();

  /// A timeout is itself "unknown", not "signed out" — the old code let the
  /// `TimeoutException` fall into a catch-all that returned null.
  Future<SessionProbe> _probe() async {
    try {
      final repo = await _repo;
      return await repo
          .probeSession()
          .timeout(const Duration(seconds: 6), onTimeout: SessionUnknown.new);
    } catch (_) {
      return const SessionUnknown();
    }
  }

  Future<void> _restoreSession() async {
    AuthUser? user;
    // Demo mode never touches the server — land on the welcome screen, where an
    // "Enter demo mode" button signs in with sample data.
    if (!AppConfig.demoMode) {
      final probe = await _probe();
      switch (probe) {
        case SessionActive(user: final confirmed):
          user = confirmed;
          await _cache.write(confirmed);
        case SessionNone():
          // The server SAID there is no session. This is the only branch that
          // may sign someone out at launch.
          user = null;
          await _cache.clear();
        case SessionUnknown():
          // Could not reach the server. Trust the last confirmed identity and
          // let the app run; if the session is actually dead, the first real
          // request 401s and the interceptor signs the user out on evidence.
          user = await _cache.read();
      }
    }
    // Hold the animated splash so its looping arrow reveal is clearly visible,
    // measured from the first painted frame (see AppBoot). It's generous because
    // a slow (debug) boot keeps the native splash up for a few seconds, eating
    // into the visible window before this fires.
    await AppBoot.firstFrame.future;
    // Just enough for the one-shot arrow reveal (starts ~1.3s in, flies ~1.3s)
    // plus a short beat, then straight to welcome — no lingering static hold.
    await Future<void>.delayed(const Duration(milliseconds: 2900));
    state = user != null
        ? AuthAuthenticated(user)
        : const AuthUnauthenticated();
  }

  /// Re-read the user from the server and republish it.
  ///
  /// The verification link in the email opens the WEBSITE, not the app, so once
  /// the user has clicked it the app has no way to notice on its own. This is
  /// what the "I've verified my email" action calls. Returns the fresh user, or
  /// null when the server could not be reached.
  Future<AuthUser?> refreshUser() async {
    final probe = await _probe();
    if (probe is SessionActive) {
      await _cache.write(probe.user);
      state = AuthAuthenticated(probe.user);
      return probe.user;
    }
    return null;
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
    await _cache.write(user);
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
    await _cache.write(user);
    state = AuthAuthenticated(user, justRegistered: true);
  }

  /// After a successful password reset the server set fresh session cookies, so
  /// the user is now signed in — flip to authenticated and the router moves them
  /// home. [user] comes from the reset-password response.
  void completePasswordReset(AuthUser user) {
    _cache.write(user);
    state = AuthAuthenticated(user);
  }

  Future<void> logout() async {
    // In demo mode there's no server session to revoke.
    if (!AppConfig.demoMode) {
      final repo = await _repo;
      // Revoke server-side FIRST — that request needs the cookies we are about
      // to delete. It swallows its own errors, so this never throws.
      await repo.logout();
      await _clearSessionCookies();
    }
    await _cache.clear();
    state = const AuthUnauthenticated();
  }

  /// Wipe the session cookies from the device.
  ///
  /// **Unconditional, and that is the point.** The credential is the cookie
  /// jar, not our state flag, and `POST /auth/logout` is the only thing that
  /// used to clear it — server-side. So a logout that failed offline, timed
  /// out, or 500'd left a live 30-day refresh cookie on the phone while the app
  /// showed the welcome screen, and the next launch's `GET /auth/me` signed the
  /// user straight back in with no password. On a shared or handed-over device
  /// that is an account takeover.
  ///
  /// Local wipe is therefore mandatory and the server revoke is best-effort —
  /// the opposite of the old order.
  Future<void> _clearSessionCookies() async {
    try {
      final jar = await ref.read(cookieJarProvider.future);
      await jar.deleteAll();
    } catch (_) {
      // Nothing better to do; the state flip below still signs them out here.
    }
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
