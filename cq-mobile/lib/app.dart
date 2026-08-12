import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_provider.dart';

/// Root of the CQ app.
///
/// A [ConsumerWidget] so the theme and the router both react to state changes.
/// Navigation is driven by `go_router` (see [routerProvider]); the router's
/// redirect decides splash vs. auth vs. home based on the auth state.
class CqApp extends ConsumerWidget {
  const CqApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Career Queue',
      debugShowCheckedModeBanner: false,
      theme: CqTheme.light,
      darkTheme: CqTheme.dark,
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}
