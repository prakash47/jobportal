import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../applications/presentation/applications_screen.dart';
import '../../home/presentation/home_screen.dart';
import '../../jobs/presentation/job_search_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../saved_jobs/presentation/saved_jobs_screen.dart';
import '../application/shell_tab.dart';

/// The app's tabbed home, shown after login/onboarding. The selected tab lives
/// in [shellTabProvider] so screens inside a tab (the Home header's counts) can
/// switch to another one instead of pushing a duplicate screen.
class MainShell extends ConsumerWidget {
  const MainShell({super.key});

  static const _tabs = <Widget>[
    HomeScreen(),
    JobSearchScreen(),
    SavedJobsScreen(),
    ApplicationsScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(shellTabProvider);
    return Scaffold(
      body: IndexedStack(index: tab.index, children: _tabs),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: context.cq.border)),
        ),
        child: NavigationBar(
          selectedIndex: tab.index,
          onDestinationSelected: (i) =>
              ref.read(shellTabProvider.notifier).select(ShellTab.values[i]),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home_rounded),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.work_outline_rounded),
              selectedIcon: Icon(Icons.work_rounded),
              label: 'Jobs',
            ),
            NavigationDestination(
              icon: Icon(Icons.bookmark_border_rounded),
              selectedIcon: Icon(Icons.bookmark_rounded),
              label: 'Saved',
            ),
            NavigationDestination(
              icon: Icon(Icons.assignment_outlined),
              selectedIcon: Icon(Icons.assignment_rounded),
              label: 'Applied',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline_rounded),
              selectedIcon: Icon(Icons.person_rounded),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
