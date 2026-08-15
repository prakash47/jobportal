import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The bottom-navigation tabs, in bar order.
enum ShellTab { home, jobs, saved, applied, profile }

/// Which tab [MainShell] is showing (Riverpod 3 `Notifier` idiom, same as the
/// theme provider).
///
/// Lifted out of `MainShell`'s local state so screens *inside* a tab can send
/// the user to another one — the Home header's Applications / Saved / Alerts
/// counts switch tabs rather than pushing a second copy of a screen that is
/// already in the bottom bar.
final shellTabProvider = NotifierProvider<ShellTabNotifier, ShellTab>(
  ShellTabNotifier.new,
);

class ShellTabNotifier extends Notifier<ShellTab> {
  @override
  ShellTab build() => ShellTab.home;

  void select(ShellTab tab) => state = tab;
}
