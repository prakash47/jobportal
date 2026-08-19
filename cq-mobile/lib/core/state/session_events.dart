import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Fires when the server refuses our refresh token — i.e. the session is over.
///
/// This is an event bus rather than the network layer calling `AuthController`
/// directly, because `AuthController` already depends on the Dio client through
/// its repository. Calling back the other way would close that loop; a counter
/// both sides can touch keeps the dependency one-directional.
///
/// It carries a counter rather than a bool so a second expiry after a
/// re-login still notifies.
final sessionExpiredProvider =
    NotifierProvider<SessionExpiredNotifier, int>(SessionExpiredNotifier.new);

class SessionExpiredNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void signal() => state = state + 1;
}
