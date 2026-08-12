import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() {
  // Bind the engine, then paint immediately — the splash shows on the very first
  // frame. The network stack (cookie jar + Dio) builds itself lazily in the
  // background (see `network_providers.dart`), so disk I/O never delays launch.
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: CqApp()));
}
