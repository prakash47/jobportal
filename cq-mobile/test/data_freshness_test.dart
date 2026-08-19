import 'package:cq_mobile/core/state/data_freshness.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Guards the fix for the "Saved tab shows the empty state right after you
/// saved something" bug. The five tabs live in an IndexedStack and each loads
/// once in initState, so a mutation made anywhere else has to reach them
/// through this bus or the user is shown stale data.
void main() {
  late ProviderContainer container;

  setUp(() => container = ProviderContainer());
  tearDown(() => container.dispose());

  test('every domain starts at version 0', () {
    final versions = container.read(dataVersionProvider);
    expect(versions.keys.toSet(), CqData.values.toSet());
    expect(versions.values.every((v) => v == 0), isTrue);
  });

  test('bumping a domain moves only that domain', () {
    container.read(dataVersionProvider.notifier).bump(CqData.savedJobs);

    final versions = container.read(dataVersionProvider);
    expect(versions[CqData.savedJobs], 1);
    expect(versions[CqData.applications], 0);
    expect(versions[CqData.alerts], 0);
    expect(versions[CqData.profile], 0);
  });

  test('a listener on one domain fires for it and not for its neighbours', () {
    var savedFires = 0;
    container.listen<int>(
      dataVersionProvider.select((m) => m[CqData.savedJobs] ?? 0),
      (_, _) => savedFires++,
    );

    container.read(dataVersionProvider.notifier).bump(CqData.applications);
    expect(savedFires, 0, reason: 'applications must not reload the Saved tab');

    container.read(dataVersionProvider.notifier).bump(CqData.savedJobs);
    expect(savedFires, 1);
  });

  test('repeated bumps keep firing — two saves are two reloads', () {
    var fires = 0;
    container.listen<int>(
      dataVersionProvider.select((m) => m[CqData.savedJobs] ?? 0),
      (_, _) => fires++,
    );

    final notifier = container.read(dataVersionProvider.notifier);
    notifier.bump(CqData.savedJobs);
    notifier.bump(CqData.savedJobs);
    notifier.bump(CqData.savedJobs);

    expect(fires, 3);
    expect(container.read(dataVersionProvider)[CqData.savedJobs], 3);
  });
}
