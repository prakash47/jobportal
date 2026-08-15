import 'dart:async';

/// Completes when the app paints its FIRST frame — i.e. the animated Dart splash
/// is actually on screen and the native splash has been removed.
///
/// The splash-hold is measured from here (not from app launch), so the splash is
/// visible for a consistent beat no matter how long the native boot took. Debug
/// boots can sit on the native splash for 5s+, which would otherwise eat the
/// entire splash window and skip it entirely.
abstract final class AppBoot {
  static final Completer<void> firstFrame = Completer<void>();

  static void markFirstFrame() {
    if (!firstFrame.isCompleted) firstFrame.complete();
  }
}
