import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../state/session_events.dart';
import 'dio_client.dart';
import 'secure_cookie_storage.dart';

/// The app's shared persistent cookie jar — it holds the login session.
///
/// Backed by [SecureCookieStorage] (platform keystore), NOT the package's
/// `FileStorage`: the refresh cookie is a 30-day credential and used to sit in
/// clear text under the documents directory, where Android's auto-backup could
/// copy it off the device.
///
/// Built **asynchronously** so `main()` does not block on it before painting —
/// the splash shows immediately while the jar is prepared behind it.
final cookieJarProvider = FutureProvider<CookieJar>((ref) async {
  final documentsDir = await getApplicationDocumentsDirectory();
  // One-time cleanup of the old plaintext store. Upgrading users sign in once
  // more; leaving a live refresh token readable on disk is not an option.
  await SecureCookieStorage.purgeLegacyPlaintextCookies(documentsDir.path);
  return PersistCookieJar(storage: SecureCookieStorage());
});

/// The app's single, shared [Dio] client, wired to the cookie jar. Also async,
/// because it depends on the (async) cookie jar. One client, one jar, one place
/// for interceptors.
final dioProvider = FutureProvider<Dio>((ref) async {
  final cookieJar = await ref.watch(cookieJarProvider.future);
  return buildDioClient(
    cookieJar,
    // Raised only when the server REFUSES the refresh token, never on a network
    // failure — see RefreshOutcome.
    onSessionExpired: () => ref.read(sessionExpiredProvider.notifier).signal(),
  );
});
