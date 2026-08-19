import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Cookie storage backed by the platform keystore instead of plain files.
///
/// **Why this replaced `FileStorage`.** The session lives in cookies, and the
/// refresh cookie is valid for 30 DAYS. `FileStorage` writes them as readable
/// JSON under the app's documents directory — so the longest-lived credential
/// in the product sat in clear text, in a directory that Android's automatic
/// cloud backup copies off the device. `flutter_secure_storage` was already a
/// dependency, used only to remember the light/dark theme.
///
/// On Android this is EncryptedSharedPreferences (AES via the Keystore); on iOS
/// it is the Keychain. Neither is readable by another app, and neither survives
/// an uninstall.
///
/// Cookie values are small (a JWT and a session id), so the per-entry size
/// limits of these stores are not a concern.
class SecureCookieStorage implements Storage {
  SecureCookieStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // No `encryptedSharedPreferences:` flag — it is deprecated in
              // flutter_secure_storage 10 and ignored; the plugin now uses its
              // own Keystore-backed ciphers by default.
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _storage;

  /// Namespaced so cookie entries can never collide with the theme key or
  /// anything else the app puts in secure storage.
  static const _prefix = 'cq_cookie_';

  String _k(String key) => '$_prefix$key';

  @override
  Future<void> init(bool persistSession, bool ignoreExpires) async {}

  @override
  Future<String?> read(String key) => _storage.read(key: _k(key));

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: _k(key), value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: _k(key));

  @override
  Future<void> deleteAll(List<String> keys) async {
    for (final key in keys) {
      await _storage.delete(key: _k(key));
    }
  }

  /// Removes the plaintext cookie directory written by the old `FileStorage`.
  ///
  /// Switching stores alone would leave the old files — and therefore a live
  /// 30-day refresh token — sitting on disk in clear text forever. Upgrading
  /// users are signed out once, which is the correct trade for that.
  ///
  /// Best-effort: a failure here must never stop the app from starting.
  static Future<void> purgeLegacyPlaintextCookies(String documentsPath) async {
    try {
      final legacy = Directory('$documentsPath/.cookies/');
      if (await legacy.exists()) {
        await legacy.delete(recursive: true);
        debugPrint('[auth] removed legacy plaintext cookie store');
      }
    } catch (_) {
      // Ignored on purpose — see above.
    }
  }
}
