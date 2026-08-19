import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app.dart';
import 'core/config/app_boot.dart';
import 'core/config/app_config.dart';

void main() {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  // Inter ships in the bundle (see `google_fonts/` in pubspec assets), so the
  // app must never reach for it over HTTP. Left enabled, a missing or renamed
  // asset would fail SILENTLY into a network fetch — fine on the developer's
  // wi-fi, and a fallback-font first impression for a user on a slow
  // connection. Off, that same mistake throws in debug and is impossible to
  // miss.
  GoogleFonts.config.allowRuntimeFetching = false;
  // A release build must never ship pointing at a developer's machine. This is
  // deliberately an assert: it fires loudly in debug and profile, and is
  // compiled out of release so it can never crash a user's app. The release
  // gate that actually blocks a bad build lives in CI, which runs the same
  // check as a real test.
  assert(
    !kReleaseMode || !AppConfig.pointsAtLocalhost,
    'Release build points at ${AppConfig.apiBaseUrl} / ${AppConfig.webBaseUrl}. '
    'Pass --dart-define=API_BASE_URL=… and WEB_BASE_URL=… .',
  );
  // Hold the native (navy) splash until the FIRST Dart frame is painted, then
  // dismiss it and mark the first frame together. This makes the native splash
  // disappear at the exact moment the animated Dart splash appears and its
  // reveal starts — otherwise the arrow-in animation plays hidden behind the
  // native splash during a slow (debug) boot and only the finished logo shows.
  FlutterNativeSplash.preserve(widgetsBinding: binding);
  WidgetsBinding.instance.addPostFrameCallback((_) {
    AppBoot.markFirstFrame();
    FlutterNativeSplash.remove();
  });
  runApp(const ProviderScope(child: CqApp()));
}
