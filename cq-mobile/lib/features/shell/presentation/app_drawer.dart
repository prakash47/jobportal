import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/theme_mode_provider.dart';
import '../../auth/application/auth_controller.dart';

/// The app's navigation side panel, available from every main tab (hamburger in
/// the app bar). Holds the secondary destinations that aren't in the bottom nav
/// (Companies, Career advice, Job alerts, Settings), a Light/Dark/System theme
/// selector, and logout.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cq = context.cq;
    final auth = ref.watch(authControllerProvider);
    final (name, email) = switch (auth) {
      AuthAuthenticated(user: final u) => (u.name, u.email),
      _ => ('Your account', ''),
    };

    // Close the drawer, then navigate — capture the router first so we don't
    // touch a context that's mid-dismissal.
    void go(String route) {
      final router = GoRouter.of(context);
      Navigator.of(context).pop();
      router.push(route);
    }

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(name: name, email: email),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _sectionLabel(context, 'Explore'),
                  _DrawerItem(
                    icon: Icons.domain_rounded,
                    label: 'Companies',
                    onTap: () => go(AppRoutes.companies),
                  ),
                  _DrawerItem(
                    icon: Icons.menu_book_rounded,
                    label: 'Career advice',
                    onTap: () => go(AppRoutes.careerAdvice),
                  ),
                  _sectionLabel(context, 'Activity'),
                  _DrawerItem(
                    icon: Icons.notifications_none_rounded,
                    label: 'Job alerts',
                    onTap: () => go(AppRoutes.alerts),
                  ),
                  _DrawerItem(
                    icon: Icons.settings_outlined,
                    label: 'Settings',
                    onTap: () => go(AppRoutes.settings),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Divider(color: cq.border, height: 1),
                  _sectionLabel(context, 'Appearance'),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      0,
                      AppSpacing.lg,
                      AppSpacing.md,
                    ),
                    child: _ThemeSelector(),
                  ),
                ],
              ),
            ),
            Divider(color: cq.border, height: 1),
            _DrawerItem(
              icon: Icons.logout_rounded,
              label: 'Log out',
              onTap: () {
                final notifier = ref.read(authControllerProvider.notifier);
                Navigator.of(context).pop();
                notifier.logout();
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.xs,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Text(
                'Career Queue · v0.1.0',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: cq.fgSubtle,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static Widget _sectionLabel(BuildContext context, String text) => Padding(
    padding: const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.md,
      AppSpacing.lg,
      AppSpacing.xs,
    ),
    child: Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: context.cq.fgSubtle,
        letterSpacing: 0.8,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.email});
  final String name;
  final String email;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    final text = Theme.of(context).textTheme;
    final initial = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : '?';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.xl),
      color: cq.brandNavy,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: cq.accent,
            child: Text(
              initial,
              style: TextStyle(
                color: cq.onAccent,
                fontWeight: FontWeight.w700,
                fontSize: 22,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            name,
            style: text.titleMedium?.copyWith(color: Colors.white),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (email.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              email,
              style: text.bodySmall?.copyWith(color: Colors.white70),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cq = context.cq;
    return ListTile(
      leading: Icon(icon, color: cq.fgMuted),
      title: Text(label, style: Theme.of(context).textTheme.bodyLarge),
      onTap: onTap,
    );
  }
}

class _ThemeSelector extends ConsumerWidget {
  const _ThemeSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final cq = context.cq;

    Widget seg(ThemeMode m, IconData icon, String label) {
      final selected = mode == m;
      return Expanded(
        child: GestureDetector(
          onTap: () => ref.read(themeModeProvider.notifier).set(m),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
            decoration: BoxDecoration(
              color: selected ? cq.accent.withValues(alpha: 0.14) : cq.surfaceMuted,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: selected ? cq.accent.withValues(alpha: 0.5) : cq.border,
              ),
            ),
            child: Column(
              children: [
                Icon(icon, size: 20, color: selected ? cq.accent : cq.fgMuted),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: selected ? cq.accent : cq.fgMuted,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        seg(ThemeMode.system, Icons.brightness_auto_rounded, 'System'),
        seg(ThemeMode.light, Icons.light_mode_rounded, 'Light'),
        seg(ThemeMode.dark, Icons.dark_mode_rounded, 'Dark'),
      ],
    );
  }
}
