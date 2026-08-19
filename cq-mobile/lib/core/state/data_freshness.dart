import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The domains whose data can go stale while the screen showing it is off-screen.
enum CqData { savedJobs, applications, alerts, profile, resume }

/// A version counter per domain, bumped whenever something mutates that domain.
///
/// **Why this exists.** The five bottom-nav tabs live in an `IndexedStack`, so
/// all five mount once at launch and each loads exactly once in `initState`.
/// Nothing ever reloaded them. Saving a job on the detail screen and then
/// opening the Saved tab showed the empty state — which then told the user to
/// go and save a job. Same for applying and the Applied tab.
///
/// The naive fix is to reload every tab on every tab change, which costs a
/// round trip each time you flick between tabs and still misses mutations made
/// from a pushed screen. This is the precise version: a mutation says what it
/// changed, and only the screens showing that thing reload — immediately, so by
/// the time the user switches tabs the list is already correct.
final dataVersionProvider =
    NotifierProvider<DataVersionNotifier, Map<CqData, int>>(
  DataVersionNotifier.new,
);

class DataVersionNotifier extends Notifier<Map<CqData, int>> {
  @override
  Map<CqData, int> build() => {for (final d in CqData.values) d: 0};

  /// Announce that [domain] changed. Cheap and safe to call from anywhere,
  /// including the screen that owns the data — a redundant reload costs one
  /// request, whereas a missed one shows the user a lie.
  void bump(CqData domain) =>
      state = {...state, domain: (state[domain] ?? 0) + 1};
}

/// Sugar for the call sites: `ref.bumpData(CqData.savedJobs)`.
extension DataFreshnessRef on Ref {
  void bumpData(CqData domain) => read(dataVersionProvider.notifier).bump(domain);
}

extension DataFreshnessWidgetRef on WidgetRef {
  void bumpData(CqData domain) => read(dataVersionProvider.notifier).bump(domain);

  /// Run [onChanged] whenever [domain]'s version moves. Call from `build`.
  void onDataChanged(CqData domain, void Function() onChanged) {
    listen<int>(
      dataVersionProvider.select((m) => m[domain] ?? 0),
      (previous, next) {
        if (previous != next) onChanged();
      },
    );
  }
}
