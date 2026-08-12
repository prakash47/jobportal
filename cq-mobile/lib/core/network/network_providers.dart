import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'dio_client.dart';

/// The app's shared persistent cookie jar — it holds the login session.
///
/// Built **asynchronously** (it needs the device's documents path, a disk
/// lookup). Making it a [FutureProvider] means `main()` no longer blocks on this
/// before painting — the splash shows immediately and the jar is prepared in the
/// background while the splash animation plays. The `.cookies/` folder is
/// created on first write, in private per-app storage.
final cookieJarProvider = FutureProvider<CookieJar>((ref) async {
  final documentsDir = await getApplicationDocumentsDirectory();
  return PersistCookieJar(
    storage: FileStorage('${documentsDir.path}/.cookies/'),
  );
});

/// The app's single, shared [Dio] client, wired to the cookie jar. Also async,
/// because it depends on the (async) cookie jar. One client, one jar, one place
/// for interceptors.
final dioProvider = FutureProvider<Dio>((ref) async {
  final cookieJar = await ref.watch(cookieJarProvider.future);
  return buildDioClient(cookieJar);
});
