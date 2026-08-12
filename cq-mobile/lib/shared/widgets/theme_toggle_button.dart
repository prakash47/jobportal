import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/theme_mode_provider.dart';

/// A compact control that cycles the app theme **system → light → dark**.
/// Reused anywhere (the welcome hero now, settings later). Pass a [color] so it
/// reads on whatever surface it sits on (e.g. white on the navy hero).
class ThemeToggleButton extends ConsumerWidget {
  const ThemeToggleButton({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final (icon, label) = switch (mode) {
      ThemeMode.system => (Icons.brightness_auto_rounded, 'System theme'),
      ThemeMode.light => (Icons.light_mode_rounded, 'Light theme'),
      ThemeMode.dark => (Icons.dark_mode_rounded, 'Dark theme'),
    };

    return IconButton(
      tooltip: '$label — tap to change',
      onPressed: () => ref.read(themeModeProvider.notifier).cycle(),
      icon: Icon(icon, color: color),
      visualDensity: VisualDensity.compact,
    );
  }
}
