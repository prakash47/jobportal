import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// App-wide light / dark / system selection (Riverpod 3 `Notifier` idiom).
///
/// Defaults to [ThemeMode.system] (follows the phone), and the user can toggle
/// through system → light → dark. The choice is **persisted**, so it survives
/// restarts; on launch we load it in the background and default to system until
/// it resolves.
final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';
  static const _storage = FlutterSecureStorage();

  @override
  ThemeMode build() {
    _load();
    return ThemeMode.system;
  }

  Future<void> _load() async {
    final saved = await _storage.read(key: _key);
    if (saved != null) state = _parse(saved);
  }

  void set(ThemeMode mode) {
    state = mode;
    _storage.write(key: _key, value: mode.name);
  }

  /// system → light → dark → system
  void cycle() {
    set(switch (state) {
      ThemeMode.system => ThemeMode.light,
      ThemeMode.light => ThemeMode.dark,
      ThemeMode.dark => ThemeMode.system,
    });
  }

  ThemeMode _parse(String v) => switch (v) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
}
