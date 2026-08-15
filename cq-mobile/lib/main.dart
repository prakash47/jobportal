import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_boot.dart';

void main() {
  final binding = WidgetsFlutterBinding.ensureInitialized();
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
