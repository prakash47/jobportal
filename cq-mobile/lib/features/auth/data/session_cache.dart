import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_user.dart';

/// Remembers the last confirmed user, in the platform keystore.
///
/// **Why cache a user at all?** The app learns who it is from `GET /auth/me`.
/// With no connectivity that call cannot answer, and without a local copy the
/// only thing the app can render is the welcome screen — signing out someone
/// whose 30-day session is perfectly valid, every time they open the app
/// underground.
///
/// With this, an unreachable server falls back to the cached identity and the
/// user stays in. If the session has genuinely died in the meantime, the first
/// real request returns 401, the Dio interceptor reports the expiry, and the app
/// signs out then — on evidence rather than on a guess.
///
/// Stored in the keystore rather than plain prefs because it holds the user's
/// name, email and phone. Cleared on logout and on a confirmed expiry.
class SessionCache {
  const SessionCache({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _storage;

  static const _key = 'cq_last_user';

  Future<AuthUser?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) return null;
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return AuthUser.fromJson(decoded);
    } catch (_) {
      // Corrupt or unreadable cache is the same as no cache.
      return null;
    }
  }

  Future<void> write(AuthUser user) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(user.toJson()));
    } catch (_) {
      // Best-effort: failing to cache costs an offline launch, not correctness.
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {
      // Ignored.
    }
  }
}
